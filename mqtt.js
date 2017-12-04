var util = require("util"),
mosca = require('mosca'),
EventEmitter = require("events").EventEmitter;

var moscaSettings = {
  backend: {},
  interfaces: [{
    type: "mqtt",
    port: 8883,
  }]
};

function setup() {
  console.log("The MQTT server is running")
}

module.exports = new EventEmitter();

var MQTT = function() {
  this.server = undefined;
}

MQTT.prototype.start = function() {
  if(this.server == undefined) {
    this.server = new mosca.Server(moscaSettings);

    //server.authenticate = authenticate_clients.authenticate;
    //server.authorizePublish = authenticate_clients.authorizePublish;
    //server.authorizeSubscribe = authenticate_clients.authorizeSubscribe;

    this.server.on('ready', setup);

    this.server.on('clientConnected', (client) => {
      console.log('client connected', client.id);
    });

    this.server.on("subscribed", (packet, client) => {
      this.emit("client/connect", client);
    })

    this.server.on("clientDisconnected", (packet, client) => {
      this.emit("client/disconnect", packet);
    });
  }
}

MQTT.prototype.publish = function(topic, json) {
  if(this.server != undefined) {
    this.server.publish({
      topic: topic,
      payload: JSON.stringify(json),
      qos:2,
      retain: false
    }, function() {
    });
  }
}

util.inherits(MQTT, EventEmitter);

module.exports = MQTT;
