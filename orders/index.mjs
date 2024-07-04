import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

// dynamo table name
const dynamoTableName = "orders";
// dyname region
const dynamoTableRegion = "us-east-1";

const dynamoDBClient = new DynamoDBClient({ region: dynamoTableRegion });
const dynamo = DynamoDBDocumentClient.from(dynamoDBClient);

const STATUS_CODE = {
    SUCCESS: 200,
    NOT_FOUND: 404,
};

export const handler = async (event, context) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    let body;
    let statusCode = "200";
    const headers = {
        "Content-Type": "application/json",
    };

    try {
        switch (event.requestContext.resourcePath) {
            case "/orders":
                if (event.httpMethod === "GET") {
                    body = await getOrders(event);
                } else if (event.httpMethod === "POST") {
                    body = await saveOrder(JSON.parse(event.body));
                }
                break;
            case "/orders/{orderId}":
                {
                    const orderId = event.pathParameters.orderId;
                    if (event.httpMethod === "GET") {
                        body = await getOrderById(orderId);
                    } else if (event.httpMethod === "PATCH") {
                        body = await modifyOrder(
                            orderId,
                            JSON.parse(event.body),
                        );
                    }
                }
                break;
            default:
                throw new Error(`Unsupported resource "${event.resource}"`);
        }
    } catch (error) {
        return buildResponse(400, {
            message: "Failed.",
            content: error,
        });
    }
    return body;
};

//FUNCTION FOR POSTING NEW ORDERS
async function saveOrder(requestBody) {
    const commandParams = {
        TableName: dynamoTableName,
        Item: requestBody,
    };
    const command = new PutCommand(commandParams);
    try {
        await dynamo.send(command);
        let notification = await sendNotif(
            "placed",
            requestBody.customer_id,
            "email",
        );

        const responseBody = {
            Operation: "SAVE",
            Message: "SUCCESS",
            Item: requestBody,
            Notif: notification,
        };

        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        return buildResponse(STATUS_CODE.NOT_FOUND, {
            message: "Error Saving",
        });
    }
}

async function sendNotif(notifType, accountId, message_type) {
    const postUrl =
        "https://d2ay4cxac6.execute-api.us-east-1.amazonaws.com/dev1/send-notification";

    // Build the request body
    const requestBody = {
        notification_type: notifType,
        account_id: accountId,
        message_type: message_type,
    };

    try {
        const response = await fetch(postUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (response.ok) {
            const responseData = await response.json(); // Parse the JSON response
            console.log("Notification sent successfully:", responseData);
            return responseData; // Return the response data
        } else {
            return "Failed to send notification.";
        }
    } catch (error) {
        return error;
    }
}

// utility function to build the response
function buildResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}

//FUNCTION TO GET ALL ORDERS
async function getOrders(event) {
    const queryParams = event.queryStringParameters || {}; // Extract query parameters

    // Set up base params
    const params = {
        TableName: dynamoTableName,
    };

    // Building the filter expressions
    const filterExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // For each query parameter, build a filter expression
    for (const key in queryParams) {
        const attributeName = `#${key}`;
        const attributeValue = `:${key}`;

        filterExpressions.push(`${attributeName} = ${attributeValue}`);
        expressionAttributeNames[attributeName] = key;
        expressionAttributeValues[attributeValue] = queryParams[key];
    }

    // Add the filter expressions to params if they exist
    if (filterExpressions.length > 0) {
        params.FilterExpression = filterExpressions.join(" AND ");
        params.ExpressionAttributeNames = expressionAttributeNames;
        params.ExpressionAttributeValues = expressionAttributeValues;
    }

    // Using ScanCommand
    const response = await dynamo.send(new ScanCommand(params));

    // Build response
    const responseBody = {
        orders: response.Items,
    };

    return buildResponse(STATUS_CODE.SUCCESS, responseBody);
}

async function getOrderById(orderId) {
    const params = {
        TableName: dynamoTableName,
        Key: {
            id: orderId,
        },
    };
    try {
        const response = await dynamo.send(new GetCommand(params));
        if (!response.Item) {
            return buildResponse(STATUS_CODE.NOT_FOUND, {
                message: "Order not found",
            });
        }
        return buildResponse(STATUS_CODE.SUCCESS, response.Item);
    } catch (error) {
        console.error("Error getting order.", error);
        return buildResponse(500, {
            error: "error getting order",
            content: error,
        });
    }
}

async function modifyOrder(orderId, requestBody) {
    const params = {
        TableName: dynamoTableName,
        Key: {
            id: orderId,
        },
        UpdateExpression:
            "set #customer_id = :customer_id, #restaurant_id = :restaurant_id, #items = :items",
        ExpressionAttributeNames: {
            "#customer_id": "customer_id",
            "#restaurant_id": "restaurant_id",
            "#items": "items",
        },
        ExpressionAttributeValues: {
            ":customer_id": requestBody.customer_id,
            ":restaurant_id": requestBody.restaurant_id,
            ":items": requestBody.items,
        },
        ReturnValues: "ALL_NEW",
    };
    try {
        const response = await dynamo.send(new UpdateCommand(params));
        let notification = await sendNotif(
            requestBody.status,
            requestBody.customer_id,
            "email",
        );
        return buildResponse(STATUS_CODE.SUCCESS, {
            message: "Order updated successfully",
            UpdatedAttributes: response.Attributes,
            notif: notification,
        });
    } catch (error) {
        console.error("Error updating order.", error);
        return buildResponse(500, {
            message: "Error updating order",
            content: error,
        });
    }
}
