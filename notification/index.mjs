import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

// dynamo table name
const dynamoTableName = "notificationsTable";
const dynamoTypeTableName = "notificationTypeTable";
// dyname region
const dynamoTableRegion = "us-east-1";

const dynamoDBClient = new DynamoDBClient({ region: dynamoTableRegion });
const dynamo = DynamoDBDocumentClient.from(dynamoDBClient);

// define all request methods here
const REQUEST_METHOD = {
    POST: "POST",
    GET: "GET",
    DELETE: "DELETE",
    PATCH: "PATCH",
};

// define all status codes here
const STATUS_CODE = {
    SUCCESS: 200,
    NOT_FOUND: 404,
};

export const handler = async (event, context) => {
    // console.log("EVENT\n" + JSON.stringify(event, null, 2));

    let response;

    switch (true) {
        case event.httpMethod === "POST" &&
            event.path === "/notification-types":
            response = await createNotificationType(JSON.parse(event.body));
            break;
        case event.httpMethod === "POST" && event.path === "/send-notification":
            response = await sendNotification(JSON.parse(event.body));
            break;
        case event.httpMethod === "GET" &&
            event.path === "/notification-history":
            response = await getNotificationHistory();
            break;
        case event.httpMethod === "GET" &&
            event.path === "/supported-notification-types":
            response = await getSupportedNotificationTypes();
            break;
        default:
            response = buildResponse(
                STATUS_CODE.NOT_FOUND,
                "Resource not found",
            );
            break;
    }
    return response;
};

// // Function to make sure request body is valid
// function isValidRequestBody(requestBody) {
//     if (!requestBody) {
//         return false;
//     }

//     const notificationType = requestBody.notification_type;

//     switch (notificationType) {
//         case "new_account":
//             return (
//                 requestBody.account_id &&
//                 requestBody.notification_type &&
//                 requestBody.notification_info
//             );
//         case "order_update":
//             return (
//                 requestBody.order_id &&
//                 requestBody.order_status &&
//                 requestBody.notification_type &&
//                 requestBody.notification_info
//             );
//         case "payment_status_update":
//             return (
//                 requestBody.payment_id &&
//                 requestBody.payment_status &&
//                 requestBody.notification_type &&
//                 requestBody.notification_info
//             );
//         case "customer_support_ticket_status_update":
//             return (
//                 requestBody.ticket_id &&
//                 requestBody.ticket_status &&
//                 requestBody.notification_type &&
//                 requestBody.notification_info
//             );
//         default:
//             return false;
//     }
// }

async function createNotificationType(requestBody) {
    try {
        // // Validate request body
        // if (!isValidNotificationTypeRequestBody(requestBody)) {
        //     throw new Error("Invalid request body");
        // }

        // Get info from request body
        const { notification_type, description } = requestBody;

        // Check if the notification type already exists
        const existingNotificationType =
            await getNotificationType(notification_type);
        if (existingNotificationType) {
            throw new Error("Notification type already exists");
        }

        // Save the new notification type to DynamoDB
        const notificationTypeItem = {
            notification_type,
            description,
        };
        await saveNotificationType(notificationTypeItem);

        // Construct response body
        const responseBody = {
            Operation: "CREATE",
            Message: "SUCCESS",
            Item: notificationTypeItem,
        };

        // Return success response
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        // Return error response
        console.error("Error:", error);
        return buildResponse(400, error.message);
    }
}

async function getNotificationType(notificationType) {
    const commandParams = {
        TableName: dynamoTypeTableName,
        Key: {
            notification_type: notificationType,
        },
    };

    try {
        const { Item } = await dynamo.send(new GetCommand(commandParams));
        return Item;
    } catch (error) {
        console.error("Error retrieving notification type:", error);
        throw error;
    }
}

async function saveNotificationType(notificationTypeItem) {
    const commandParams = {
        TableName: dynamoTypeTableName,
        Item: notificationTypeItem,
    };

    try {
        await dynamo.send(new PutCommand(commandParams));
    } catch (error) {
        console.error("Error saving notification type:", error);
        throw error;
    }
}

// Function to send notification
async function sendNotification(requestBody) {
    try {
        let notifTypeExists = await getNotificationType(
            requestBody.notification_type,
        );
        if (!notifTypeExists) {
            return buildResponse(400, "Notif type doesn't exist");
        }
        let highestId = await getHighestId();
        let newid = (highestId + 1).toString();

        // Send notification based on notification type
        const notificationItem = {
            id: newid,
            account_id: requestBody.account_id,
            notificationType: requestBody.notification_type,
            notificationMessage: notifTypeExists.description,
            sentTime: new Date().toISOString(),
        };
        const commandParams = {
            TableName: dynamoTableName,
            Item: notificationItem,
        };
        const command = new PutCommand(commandParams);
        await dynamo.send(command);
        const responseBody = {
            Operation: "SAVE",
            Message: "SUCCESS",
            Item: notificationItem,
        };
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        console.error("Error:", error);
        return buildResponse(400, error.message);
    }
}

async function getHighestId() {
    const params = {
        TableName: dynamoTableName,
        ProjectionExpression: "id", // Adjust this if your ID attribute has a different name
    };

    try {
        const result = await dynamo.send(new ScanCommand(params));

        if (result.Items && result.Items.length > 0) {
            // Extract IDs from the results and find the maximum
            const ids = result.Items.map((item) => parseInt(item.id, 10));
            const highestId = Math.max(...ids);

            return highestId;
        } else {
            return 0;
        }
    } catch (error) {
        return 0;
    }
}

// async function sendNewAccountNotification(requestBody) {
//     const accountId = requestBody.account_id;
//     const notificationMessage = "Welcome to TigerChow! Your new account (" + accountId + ") has been created successfully.";
//     const notificationItem = {
//         id: requestBody.account_id,
//         notificationType: requestBody.notification_type,
//         notificationMessage: notificationMessage,
//         user: accountId,
//         contactMethod: requestBody.contact_method || "email", // Default to email if not specified
//         sentTime: new Date().toISOString()
//     };
//     const commandParams = {
//         TableName: dynamoTableName,
//         Item: notificationItem,
//     };
//     const command = new PutCommand(commandParams);
//     try {
//         await dynamo.send(command);
//         const responseBody = {
//             Operation: "SAVE",
//             Message: "SUCCESS",
//             Item: notificationItem,
//         };
//         return buildResponse(STATUS_CODE.SUCCESS, responseBody);
//     } catch (error) {
//         return buildResponse(400, error);
//     }
// }

// async function sendOrderUpdateNotification(requestBody) {
//     const orderId = requestBody.order_id;
//     const orderStatus = requestBody.order_status;
//     const notificationMessage = "Your order (" + orderId + ") has been updated to " + orderStatus + ".";
//     const notificationItem = {
//         id: orderId,
//         orderId: orderId,
//         orderStatus: orderStatus,
//         notificationType: requestBody.notification_type,
//         notificationMessage: notificationMessage,
//         user: "user_id",
//         contactMethod: requestBody.contact_method || "email", // Default to email if not specified
//         sentTime: new Date().toISOString()
//     };
//     const commandParams = {
//         TableName: dynamoTableName,
//         Item: notificationItem,
//     };
//     const command = new PutCommand(commandParams);
//     try {
//         await dynamo.send(command);

//         const responseBody = {
//             Operation: "SAVE",
//             Message: "SUCCESS",
//             Item: notificationItem,
//         };
//         return buildResponse(STATUS_CODE.SUCCESS, responseBody);
//     } catch (error) {
//         return buildResponse(400, error);
//     }
// }

// async function sendPaymentStatusUpdateNotification(requestBody) {
//     const paymentId = requestBody.payment_id;
//     const paymentStatus = requestBody.payment_status;
//     const notificationMessage = "Your payment ("+ paymentId+ ") status has been updated to "+ paymentStatus+ ".";
//     const notificationItem = {
//         id: requestBody.payment_id,
//         notificationType: requestBody.notification_type,
//         notificationMessage: notificationMessage,
//         user: "user_id",
//         contactMethod: requestBody.contact_method || "email", // Default to email if not specified
//         sentTime: new Date().toISOString()
//     };
//     const commandParams = {
//         TableName: dynamoTableName,
//         Item: notificationItem,
//     };
//     const command = new PutCommand(commandParams);
//     try {
//         await dynamo.send(command);
//         const responseBody = {
//             Operation: "SAVE",
//             Message: "SUCCESS",
//             Item: notificationItem,
//         };
//         return buildResponse(STATUS_CODE.SUCCESS, responseBody);
//     } catch (error) {
//         return buildResponse(400, error);
//     }
// }

// async function sendCustomerSupportTicketStatusUpdateNotification(requestBody) {
//     const ticketId = requestBody.ticket_id;
//     const ticketStatus = requestBody.ticket_status;
//     const notificationMessage = "The status of your customer support ticket ("+ ticketId+ ") has been updated to "+ ticketStatus+ ".";
//     const notificationItem = {
//         id: requestBody.ticket_id,
//         notificationType: requestBody.notification_type,
//         notificationMessage: notificationMessage,
//         user: "user_id",
//         contactMethod: requestBody.contact_method || "email", // Default to email if not specified
//         sentTime: new Date().toISOString()
//     };
//     const commandParams = {
//         TableName: dynamoTableName,
//         Item: notificationItem,
//     };
//     const command = new PutCommand(commandParams);
//     try {
//         await dynamo.send(command);
//         const responseBody = {
//             Operation: "SAVE",
//             Message: "SUCCESS",
//             Item: notificationItem,
//         };
//         return buildResponse(STATUS_CODE.SUCCESS, responseBody);
//     } catch (error) {
//         return buildResponse(400, error);
//     }
// }

// Function to retrieve notification history
async function getNotificationHistory() {
    try {
        const response = await dynamo.send(
            new ScanCommand({ TableName: dynamoTableName }),
        );
        const responseBody = {
            notifs: response.Items,
        };
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        console.error("Error retrieving notification history:", error);
        return buildResponse(400, error.message);
    }
}

async function getSupportedNotificationTypes() {
    const commandParams = {
        TableName: dynamoTypeTableName,
    };

    try {
        const { Items } = await dynamo.send(new ScanCommand(commandParams));
        const notificationTypes = Items.map((item) => item.notification_type);
        const responseBody = {
            Operation: "GET_SUPPORTED_NOTIFICATION_TYPES",
            Message: "SUCCESS",
            SupportedNotificationTypes: notificationTypes,
        };
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        console.error("Error retrieving supported notification types:", error);
        return buildResponse(400, error.message);
    }
}

// async function isValidNotificationTypeRequestBody()

// Utility function to build the response
function buildResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}
