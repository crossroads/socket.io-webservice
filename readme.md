# SocketIO Web Service

The SocketIO Web Service allows multiple sites, differentiated via socket.io namespace, to send push messages to connected clients using socket.io.

When a client connects a request is made to your website to authenticate the user via the Authorization header, and to retrieve the list of rooms the client belongs to which can be a group name or individual name for direct communication. Your website can then send messages via this webservice to the clients, while the clients can communitate with your website directly.

## Installation

* Install nodejs - https://github.com/creationix/nvm
* `git clone` this repository
* `npm install`

## Running

* `npm start`
* Visit your app at http://localhost:1337.

## Debugging

* `npm run debug`
* Add a break point at start of app and hit continue in the debugger
* Visit your app at e.g. http://localhost:1337 in a different tab
* Now you can add a break point where you want to debug

## Config

Configuration details are stored in `config.yml` and before the app starts `NODE_ENV` can be set to either `dev`, `test` or `prod`. If no environment is specified it defaults to prod.

* port - the port the socket.io webservice will be available at
* redisHost (optional) - the hostname of the redis service to use
* redisPort (optional) - the port number of the redis service to use
* redisKey (optional) - the redis key of the redis service to use if password is required

## Add New Site
To add new sites modify `sites.yml` as follows:

```yml
newsite:
  authUrl: http://newsite.com/socketrooms
  authScheme: Bearer
  apiKey: 54321
```

* name - is the namespace for socketio, the client connects as `io("/newsite")`
* authUrl - this is the url the socketio webservice will use to retrieve the rooms the authenticated user belongs to, the client is required to provide the token `io("/newsite?token=12345")` on connection and will form part of the Authorization header that will be used when the request is made to authUrl
* authScheme - is used as part of the Authorization header that will be sent to the authUrl
* apiKey - used to authenticate requests when sending messages to clients via this webservice

## Send Messages

`http://socketio-webservice.com/send?site=newsite&apiKey=54321`

Supports `Content-Type` `application/json` and `application/x-www-form-urlencoded`. Example:

```json
{
  "rooms": ["user_1", "staff"],
  "event": "update_store",
  "args": ["user", {"id":1,"age":5}]
}
```

## Known Issues

* Nodejs has trouble connecting local websites via localhost during authentication, the workaround is to start rails bound to 127.0.0.1 instead (the socket.io authUrl can still say localhost) .e.g

  `rails s --binding=127.0.0.1`

* Debugger currently does not work in node 0.10.35 or 0.10.34 will be fixed in 0.10.36 but use 0.10.33 for now.

## Installing Nginx / Passenger

Assumes you've installed rvm already

```shell
yum install nodejs npm
gem install passenger
rvmsudo passenger-install-nginx-module --languages nodejs --auto
```

## Shipit Deployment

Like Capistrano is for Ruby

    npm install --save-dev grunt grunt-shipit
    grunt shipit:production deploy
    grunt shipit:production rollback

Note this doesn't copy shared files across yet... perhaps switch back to capistrano?!
