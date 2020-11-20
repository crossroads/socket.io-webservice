# SocketIO Web Service

[![Code Climate](https://codeclimate.com/github/crossroads/socket.io-webservice/badges/gpa.svg)](https://codeclimate.com/github/crossroads/socket.io-webservice)
[![Issue Count](https://codeclimate.com/github/crossroads/socket.io-webservice/badges/issue_count.svg)](https://codeclimate.com/github/crossroads/socket.io-webservice)

This project currently runs on NodeJS v6 LTS (boron).

The SocketIO Web Service allows multiple sites, differentiated via socket.io namespace, to send push messages to connected clients using socket.io.

When a client connects a request is made to your website to authenticate the user via the Authorization header, and to retrieve the list of rooms the client belongs to which can be a group name or individual name for direct communication. Your website can then send messages via this webservice to the clients, while the clients can communicate with your website directly.

* [Sending Messages](#sending-messages)
* [Handling unreliable connections](#handling-unreliable-connections)
* [Client](#client)
  * [Special events](#special-events)
* [Config](#config)
  * [Add new site](#add-new-site)
* [Development](#development)
  * [Installation](#installation)
  * [Running](#running)
  * [Debugging](#debugging)
* [Production](#production)
  * [Installing Nginx / Passenger](#installing-nginx--passenger)
  * [Capistrano Deployment](#capistrano-deployment)
* [Known Issues](#known-issues)

## Sending Messages

The intention is client apps communicate directly with the server app, and the server app uses the following POST request on this app to communicate with the client app.

POST `http://socketio-webservice.com/send?site=newsite&apiKey=54321&resync=false`

Supports `Content-Type` `application/json` and `application/x-www-form-urlencoded`. Example:

```json
{
  "rooms": ["user_1", "staff"],
  "event": "update_store",
  "args": ["user", {"id":1,"age":5}]
}
```

* `resync` - performs a check when client indicates a message is received to ensure it's the first in the queue. If not, it will clear the queue and send a message to client to resync all data (default `false`).

## Handling unreliable connections

To handle unreliable connections socket.io web service uses a Redis cache to store messages and waits for the client to invoke the callback function before removing the message from redis. This is only enabled if the `userRoomPrefix` setting (see add new site section) is specified and if it is then every user must belong to a user room that represents a single user.

```js
// client app
socket.on("update_store", function(entityType, entity, successCallback) {
  successCallback();
});
```

Upon reconnection all the messages for the connecting user will be sent to the client at once as the `_batch` event with just a single successCallback for the batch event:

```js
// client app
socket.on("_batch", batch);
socket.on("update_store", update_store);

function batch(events, successCallback) {
  events.forEach(function(args) {
    var event = args[0]; // e.g. update_store
    var eventArgs = args.slice(1);
    window[event].apply(this, eventArgs);
  });
  successCallback();
}

function update_store(entityType, entity, successCallback) {
  ...
  if (successCallback) {
    successCallback();
  }
}
```

For scenarios where socket.io is used to keep a local database in sync with a server database. There is an option you can turn on called `resync` when sending a message to the client (see send messages section). On success callback a check is made on the server to ensure the message being removed is the first one in the queue for that user and event. If not, say due to a client error processing previous message so that success callback was never called, all the queued messages for that user are cleared and a `_resync` event will be sent to the client allowing a full resync to be performed:

```js
// client app
socket.on("_resync", function() {
  window.location.reload(); // assumes client app performs full sync on page load
});
```

It is up to the client to specify what action to take when the `_resync` is received.

## Client

```js
// client app
var socket = io("http://domain.com/<namespace>?token=12345&deviceId=090909");
```

* namespace - the namespace should match the name used in `sites.yml` (see add new site)
* token - is the token that will form the authorization header with authScheme in sites.yml that will be sent with the request to retrieve rooms from authUrl defined in sites.yml (see add new site)
* deviceId - this is intended for support of a single user having multiple devices (e.g. could be a user with two browser tabs open if not updating a shared data storage)

### Special events

```js
// client app
socket.on("_batch", function(events, success) {
  events.forEach(function(args) {
    window[args[0]].apply(this, args.slice(1));
  }, this);
  if (success) { success(); }
});

socket.on("_resync", function() {
  window.location.reload();
});
```

* `_batch` - when client connects and if there are awaiting messages they are sent all at once as this event (see Handling unreliable connections)
* `_resync` - if resync was turned on when sending a message, if message is not first in message queue when success callback was called then this event is sent to let client know to perform a full sync  (see Handling unreliable connections)
* `_settings` - when client connects an object with settings is sent, currently it just contains `device_ttl`

## Config

Configuration details are stored in `config.yml` and before the app starts `NODE_ENV` can be set to either `development` or `production`. If no environment is specified it defaults to production.

```yml
production:
  port: 80
  device_ttl: 3600
  redis:
    url: rediss://:<password>@<host>:<port>/<database>
  flakeid:
    datacenter: 0
    worker: 0
  io:
    pingTimeout: 60000
  airbrake:
    key: 12345
    protocol: https
    serviceHost: api.airbrake.io
  winston:
    file:
      level: info
      filename: ./logs/log.txt
      handleExceptions: true
    console:
      level: info
  servers:
    - deployer@server1.example.com
    - deployer@server2.example.com
```

* port - the port the socket.io webservice will be available at (default 1337)
* device_ttl - the time messages will continue to be kept once the client becomes offline, set to 0 for messages to be kept indefinitely (default 3600 sec)
* redis
  * url - standard Redis connection url
* flakeid (used to id messages in redis queue)
  * a full list of options can be found here https://github.com/T-PWK/flake-idgen#usage
* io
  * a full list of options can be found here https://github.com/Automattic/socket.io#serveroptsobject
* airbrake (optional, a [webservice](https://github.com/errbit/errbit) to log errors to)
  * key - the api key used to authorize access to the airbrake server instance
  * protocol - the http protocol of the airbrake server instance (default http)
  * serviceHost - the host name of the airbrake server instance (default api.airbrake.io)
  * a full list of options (will be set as properties of airbrake instance) can be found here https://github.com/felixge/node-airbrake
* winston - a logging library; can use a list of the built-in transports (default is console), options can be found here https://github.com/winstonjs/winston#working-with-transports

### Add new site
To add new sites modify `sites.yml` as follows:

```yml
newsite:
  authUrl: http://newsite.com/socketrooms
  authScheme: Bearer
  apiKey: 54321
  userRoomPrefix: user_
  updateUserUrl: http://newsite.com/users/:id
```

* name - is the namespace for socketio, the client connects as `io("/newsite")`
* authUrl - this is the url the socketio webservice will use to retrieve the rooms the authenticated user belongs to, the client is required to provide the token `io("/newsite?token=12345")` on connection and will form part of the Authorization header that will be used when the request is made to authUrl
* authScheme - is used as part of the Authorization header that will be sent to the authUrl
* apiKey - used to authenticate requests when sending messages to clients via this webservice
* userRoomPrefix - the prefix rooms belonging to a single user starts with, used for determining whether to enable handling connection reliability functionality, if specified then every user must belong to a private room
* updateUserUrl - this is the url the socketio webservice will use to update about the user's last connected and disconnected time. It will be PUT request with parameters example: {"id"=>"8", "user"=>{"last_connected"=>"2015-05-06T07:49:29.196Z"}}

## Development

### Installation

* Install redis - `sudo apt-get install redis-server redis-tools`
* Install nodejs - https://github.com/creationix/nvm
* `git clone` this repository
* `npm install`

### Installation on Server

As deployer user:

```shell
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
nvm install lts/boron    # v6
```

Add the following line to Passenger conf

```
passenger_nodejs /home/deployer/.nvm/versions/node/v6.14.3/bin/node;
```

### Running

* `npm start`
* Visit your app at http://localhost:1337.

### Debugging

* `npm run debug`
* Add a break point at start of app and hit continue in the debugger
* Visit your app at e.g. http://localhost:1337 in a different tab
* Now you can add a break point where you want to debug

## Production

### Installing nginx / passenger

Assumes you've installed rvm already

```shell
yum install nodejs npm
gem install passenger
rvmsudo passenger-install-nginx-module --languages nodejs --auto
```

### Capistrano Deployment

Check in your code and push it upstream as Capistrano will checkout code from your git repo rather than uploading your local files.

    cap staging deploy
    cap production deploy
    cap production deploy:rollback

The deploy script automatically handles `npm install` on the remote machine and ensures shared files are symlinked to the current folder.

## Known issues

* Nodejs has trouble connecting to local websites via localhost during authentication, the workaround is to start rails (or some other web app) bound to 127.0.0.1 instead (the socket.io authUrl can still say localhost) .e.g

  `rails s --binding=127.0.0.1`

* The app hangs if you set logging mode to `DEBUG=*` when debugging the app
* Debugger does not work in node versions 0.10.34 and 0.10.35
