var io = require('socket.io-client')
, assert = require('assert')
, expect = require('expect.js');
var app = require("express");
var httpClient = require("request");
var httpMocks = require('node-mocks-http');
// var nock = require('nock');

// var authApi = nock('http://localhost:3000')
//                 .get('/api/v1/auth/current_user_rooms')
//                 .reply(200, {
//                   data: ['user_1']
//                  });

describe('Suite of unit tests', function() {
  var socket;
  beforeEach(function(done) {
    // Setup
    socket = io.connect('http://localhost:1337/goodcity', {
      'reconnection delay' : 0
      , 'reopen delay' : 0
      , 'force new connection' : true
      , forceNew: true
    });

    socket.on('connect', function() {
      console.log('worked...');
    });

    socket.on('disconnect', function() {
      console.log('disconnected...');
    })

    done();
  });

  afterEach(function(done) {
    // Cleanup
    if(socket.connected) {
        console.log('disconnecting...');
        socket.disconnect();
    } else {
        // There will not be a connection unless you have done() in beforeEach, socket.on('connect'...)
        console.log('no connection to break...');
    }
    done();
  });

  describe('Few dummy test to check socket.io connection', function() {
    it('nsp should be goodcity and port', function(done) {
      expect(socket.io.engine.port).to.be('1337');
      expect(socket.nsp).to.be("/goodcity");
      done();
    });

    it('Testing Array indexOf', function(done) {
      expect([1, 2, 3].indexOf(5)).to.be.equal(-1);
      expect([1, 2, 3].indexOf(0)).to.be.equal(-1);
      done();
    });
  });
});
