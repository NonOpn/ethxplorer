const config = require("../configs/blocks.js"),
Web3 = require("web3"),
web3 = new Web3(new Web3.providers.HttpProvider(config.web3));
module.exports = web3;
