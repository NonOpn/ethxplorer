const config = require("./configs/server.js"),
express = require("express"),
app = express(),
api_v1 = require("./server/api_v1");

const server = require("http").Server(app);

app
.use("/api/v1", api_v1);

app.listen(config.port, config.address);

module.exports = app;
