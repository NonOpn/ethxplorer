require("dotenv").config();


module.exports = {
  "web3": process.env.WEB3,
  "json_rpc_endpoint": process.env.JSON_RPC_ENDPOINT,
  "speedup": parseInt(process.env.SPEEDUP),
  "mysql": {
    "host" : process.env.MYSQL_HOST,
    "user" : process.env.MYSQL_USER,
    "password" : process.env.MYSQL_PASSWORD,
    "database" : process.env.MYSQL_DATABASE
  },
  "timeout_block": parseInt(process.env.TIMEOUT_BLOCK)
}
