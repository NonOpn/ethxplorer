const config = require("./configs/server.js"),
express = require("express"),
app = express(),
api_v1 = require("./server/api_v1");


function Server() {

}

Server.prototype.start = function() {
  if(this.app) {
    console.log("server already listening");
    return false;
  }
  const server = require("http").Server(app);

  app
  .use("/api/v1", api_v1);

  app.listen(config.port, config.address);

  this.app = app;
  this.server = server;

  console.log(`server is now listening on ${config.address}:${config.port}`);

  return true;
}

module.exports = Server;
