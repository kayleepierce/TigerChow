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
const dynamoTableName = "sprint2";
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
            case "/accounts":
                if (event.httpMethod === "GET") {
                    body = await getUsers();
                } else if (event.httpMethod === "POST") {
                    body = await saveUser(JSON.parse(event.body));
                }
                break;
            case "/account/{id}":
                {
                    const userId = event.pathParameters.id;
                    if (event.httpMethod === "GET") {
                        body = await getUserById(userId);
                    } else if (event.httpMethod === "DELETE") {
                        body = await deleteUser(userId);
                    }
                }
                break;
            case "/account/guest-login":
                if (event.httpMethod === "POST") {
                    // Guest login logic here
                    // For simplicity, just echoing back the body
                    if(JSON.parse(event.body).hasOwnProperty("token")){
                        body = buildResponse(200, JSON.parse(event.body));
                    }
                    else {
                        body = buildResponse(400, {"error": "Token not included in body"})
                    }
                }
                break;
            case "/account/preferences":
                if (event.httpMethod === "PUT") {
                    body = await updateUserPreferences(JSON.parse(event.body));
                }
                break;
             case "/account/last-active-time/{id}":
                {
                    const userId = event.pathParameters.id;
                    if (event.httpMethod === "GET") {
                        body = await lastActiveTime(userId);
                    }
                }
                break;
            case "/account/auto-logout":
                if (event.httpMethod === "POST") {
                    body = await changeStatus(JSON.parse(event.body), 0);
                }
                break;
            case "/account/login":
                if (event.httpMethod === "POST") {
                    body = await login(JSON.parse(event.body));
                }
                break;
            default:
                throw new Error(`Unsupported resource "${event.resource}"`);
        }
    } catch (error) {
        return buildResponse(400, {
            message: "Failed.",
            content: error
        });
    }
    return body;
};

//FUNCTION FOR POSTING NEW USERS
async function saveUser(requestBody) {
    const commandParams = {
        TableName: dynamoTableName,
        Item: requestBody,
    };
    const command = new PutCommand(commandParams);
    try {
        await dynamo.send(command);
        const responseBody = {
            Operation: "SAVE",
            Message: "SUCCESS",
            Item: requestBody,
        };
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        return buildResponse(STATUS_CODE.NOT_FOUND, {
            message: "Error Saving",
        });
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

async function deleteUser(userID) {
    const params = {
        TableName: dynamoTableName,
        Key: {
            id: Number(userID),
        },
        ReturnValues: "ALL_OLD",
    };
    const command = new DeleteCommand(params);
    try {
        const response = await dynamo.send(command);
        const responseBody = {
            Operation: "DELETE",
            Message: "SUCCESS",
            Item: response,
        };
        return buildResponse(STATUS_CODE.SUCCESS, responseBody);
    } catch (error) {
        return buildResponse(STATUS_CODE.NOT_FOUND, {
            message: "Error Deleting",
        });
    }
}

//FUNCTION TO GET ALL USERS
async function getUsers() {
    const params = {
        TableName: dynamoTableName,
    };
    const response = await dynamo.send(new ScanCommand(params));
    const responseBody = {
        users: response.Items,
    };
    return buildResponse(STATUS_CODE.SUCCESS, responseBody);
}

async function getUserById(userId) {
    const params = {
        TableName: dynamoTableName,
        Key: {
            id: Number(userId),
        },
    };
    try {
        const response = await dynamo.send(new GetCommand(params));
        if (!response.Item) {
            return buildResponse(STATUS_CODE.NOT_FOUND, {
                message: "User not found",
            });
        }
        return buildResponse(STATUS_CODE.SUCCESS, response.Item);
    } catch (error) {
        console.error("Error getting user.", error);
        return buildResponse(500, {"error": "error getting user", "content":error });
    }
}

async function updateUserPreferences(body) {
    try {
        const command = new UpdateCommand({
            TableName: dynamoTableName,
            Key: {
              id: Number(body.id),
            },
            UpdateExpression: "set preferences.address = :address, preferences.preferredFont = :preferredFont, preferences.darkModeOn = :darkModeOn, preferences.paymentMethod = :paymentMethod, preferences.#lang = :language, preferences.loginCredentials.email = :email, preferences.loginCredentials.password = :password, preferences.notificationSettings.phone_number = :phoneNumber, preferences.notificationSettings.#txt = :text, preferences.notificationSettings.push = :push, preferences.notificationSettings.email = :notificationEmail",
            ExpressionAttributeNames: {
              "#lang": "language",
              "#txt": "text"
            },
            ExpressionAttributeValues: {
              ":address": body.address,
              ":preferredFont": body.preferredFont,
              ":darkModeOn": body.darkModeOn,
              ":paymentMethod": body.paymentMethod,
              ":language": body.language,
              ":email": body.loginCredentials.email,
              ":password": body.loginCredentials.password,
              ":phoneNumber": body.notificationSettings.phone_number,
              ":text": body.notificationSettings.text,
              ":push": body.notificationSettings.push,
              ":notificationEmail": body.notificationSettings.email,
            },
            ReturnValues: "ALL_NEW",
          });

        const response = await dynamo.send(command);

        if (response.$metadata.httpStatusCode === 200) {
           
            return buildResponse(200, {
                message: "Updated Preferences!",
                account: response.Attributes
            });
            
        } else if (response.$metadata.httpStatusCode === 404) {
            return buildResponse(404, {
                message: "User not found.",
            });
        }
    }
    catch (error)
    {
        return buildResponse(400, {
            message: "Failed to update prefs.",
            content: error
        });
    }
}

async function lastActiveTime(activeId) {
    const params = {
        TableName: dynamoTableName,
        Key: {
            id: Number(activeId),
        },
    };
    try {
        const response = await dynamo.send(new GetCommand(params));
        if (!response.Item) {
            return buildResponse(STATUS_CODE.NOT_FOUND, {
                message: "User not found",
            });
        }
        return  buildResponse(200, {
            value: response.Item.lastActiveTime
        });
    }
    catch(error)
    {
        return buildResponse(400, {
            message: "Error"
        });
    }
}

async function changeStatus(body, value)
{
    let activetime = "";
    var date = new Date();
    if(value === 1) {
        activetime = date.toUTCString();
    }
    try {
        const command = new UpdateCommand({
            TableName: dynamoTableName,
            Key: {
                id: Number(body.id),
            },
            UpdateExpression: "set #s = :status, lastActiveTime = :activetime", 
            ExpressionAttributeNames: {
                "#s": "status",
            },
            ExpressionAttributeValues: {
            ":status": value,
            ":activetime": activetime,
            },
            ReturnValues: "ALL_NEW",
        });

        const response = await dynamo.send(command);

        if (response.$metadata.httpStatusCode === 200) {
            if(value === 0)
            {
                return buildResponse(200, {
                    message: "Logout Success!",
                    account: response.Attributes
                });
            }
            else
            {
                return buildResponse(200, {
                    message: "Login Success!",
                    account: response.Attributes
                });
            }
        } else if (response.$metadata.httpStatusCode === 404) {
            return buildResponse(404, {
                message: "User not found",
            });
        }
    }
    catch (error)
    {
        return buildResponse(400, {
            message: "Failed to logout.",
            content: error
        });
    }
}

async function login(body)
{
    try {
        const commandFind = new ScanCommand({
            TableName: dynamoTableName,
            FilterExpression: 'preferences.loginCredentials.email = :email',
            ExpressionAttributeValues: {
              ':email': body.email,
            },
            ConsistentRead: true,
          });
          
        const response = await dynamo.send(commandFind);

        if(response.Items && response.Items.length > 0 && response.Items[0].preferences.loginCredentials.password === body.password) {
            let message = await changeStatus({id: response.Items[0].id}, 1)
            return message;
        }
        else if (response.Items && response.Items.length > 0) {
            return buildResponse(404, {
                message: "Incorrect Password",
            });
        }
        else {
            return buildResponse(404, {
                message: "User not found",
            });
        }
    }
    catch (error)
    {
        return buildResponse(400, {
            message: "Failed to login internally.",
            content: error
        });
    }
}
