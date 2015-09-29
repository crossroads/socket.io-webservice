# How GoodCity uses this Project

An attempt to explain how GoodCity uses the socketio-webservice project.

## Glossary

* User - individual who uses the GoodCity website
* Room - a channel name that enables communication from the API to the user
* DeviceId - a user may connect to a room via many devices - each connection is given a deviceId
* Socket - an individual connection from a browser window to the socketio-webservice

## Room names and rationale

* In the donor app, a user joins ```user_3``` room.
* In the admin app, a user joins ```user_3_admin``` and ```reviewer``` rooms.

In some edge case scenarios, an admin will want to behave as a donor. In order to do this properly, if an admin logs in to the donor app, the API treats them as a donor (wrt security permissions). They will be logged in to the ```user_3``` room but not the ```reviewer``` room.

If an admin also logs into the admin app they will join the ```user_3_admin``` room. This is deliberately distinct from the ```user_3``` room in order to avoid sending admin messages to the donor app.

## DeviceId

If a user logs in to several browser windows (or mobile devices), they are registered to the same rooms and each open session is given a distinct deviceId. This enables us to track message sending/delivery/receipt per browser window / device and therefore re-send (or resync) messages that aren't received.

## Message tracking

When a messages is sent to a room, it is stored in redis and then delivered to each open session
