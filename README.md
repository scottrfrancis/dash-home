# Home Dashboard

A simple dashboard to show the status of various systems around the house and to facilitate easy control of some of the more complex ones.

First project is to provide visibility into the Pool equipment. I have a Pentair IntelliTouch controller with wireless remote. Among other issues with that system is the complexity to determine if you turned off the heater or not. Requires about 20 different button clicks and navigation of a clunky menu system. This project seeks to make that information visible.

A second effort is to provide visibility and ad hoc control of the BHyve irrigation controller, which is also used in my house to control the pool filler. Most of the time a regular schedule is sufficient, but trigging a 5 or 10 minute fill on an ad hoc basis would be nice.

### Amplify Framework

This project was built using the [Amplify Framework for React](https://docs.amplify.aws/start/q/integration/react) and will interface, initially, with an AWS IoT Device Shadow for data.

*TODO*
* Push to CloudFront (for https hosting) and register DNS
* Refactor the Dashboard component into service and view components
* Implement desired state functionality -- right now this is read-only.
* Abstract the direct connect to the Shadow with AppSync and a control API Gateway
* Interface with the BHyve
* Create some 'macro' buttons for activities like draining the pool (start the pump, wait, open the drain valve, wait, close, wait, stop)

![Dashboard on iPad](https://github.com/scottrfrancis/dash-home/blob/master/IMG_0095.PNG)

## Design Notes

This is a basic React app that uses react-bootstrap for layout and a couple other components. Most of the work is done in one big component, `Dashboard`. This needs to be refactored.
The tricky part here is the magic to get the IoT Data. To supply that data, I previously created an [IoT Thing](https://github.com/scottrfrancis/Pentair-Thing) to read the Pentair Protocol and publish to a device Shadow.
To make things simple (quick and dirty), I'm connecting directly to the device shadow. This has the advantage of getting updates quickly and an easy interface to request changes to turn things on and off. 
However, it won't readily extend to other control surfaces, like Alexa, where we will need an API.

The Amplify Framework uses [AWS Cognito](https://aws.amazon.com/cognito/) for user management, and I took the easy route of just wrapping my main component with the Amplify HOC. Easy and secure.

### Connecting IoT

Beyond bringing up the React app, and assuming you have a device shadow to read from, there are some steps needed to enable the two to talk.

Having created a Cognito user pool as part of the Amplify setup, you need to allow authenticated users to attach to IoT data. This is done by 
1. Finding the role used by the authenticated cognito users in the IAM Console.
2. Create a new policy (attachIoTPolicy) and attach to the role using
```
{ "Version": "2012-10-17", "Statement": [ 
    { "Sid": "VisualEditor0", 
    "Effect": "Allow", 
    "Action": "iot:AttachPolicy", 
    "Resource": "*" } 
] }
```
3. Additionally attach the standard policy `AWSIoTDataAccess` to the cognito role.

The code here relies on having some configuration in the file `aws-iot.js`, which has this structure:
```
const awsiot = {
    aws_pubsub_region: "<your region>",
    aws_iot_endpoint: "<address from query below>",
    policy_name: "<policy name created below>"
}
export default awsiot
```

There are some setup steps to complete that file:
1. Install the [AWS CLI tool](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html) and `jq` if you don't have them.
2. Get the `aws_iot_endpoint` with the command
```
aws iot describe-endpoint --endpoint-type iot:data-ats | jq '.endpointAddress'
```
3. In the AWS IoT Console, create a new policy (dashboard-policy) with this statement and copy the name (dashboard-policy) to the `policy_name` property.
```
{ "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": "iot:*", "Resource": "*" } ] }
```
4. From the `aws-exports.js` file that Amplify creates, get the value for the `aws_cognito_identity_pool_id` property and attach the newly created policy to the identity pool with a command like this
```
aws iot attach-policy --policy-name dashboard-policy --target <aws_identity_pool_id from above>
```
