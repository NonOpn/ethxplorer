const mysql = require("mysql"),
config = require("../configs/blocks.js");


var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  database : config.mysql.database
});

connection.connect();

const CREATE_TABLE_ADDRESS = "CREATE TABLE IF NOT EXISTS Address ("
+"`id` BIGINT NOT NULL AUTO_INCREMENT,"
+"`address` VARCHAR(60) NOT NULL," //ethereum addresses are 20 bytes longs > 40 char bytes + 2 char bytes (0 + x)
+"PRIMARY KEY `id` (`id`),"
+"UNIQUE KEY `address` (`address`)"
+")ENGINE=InnoDB;";

const CREATE_TABLE_TRANSACTION = "CREATE TABLE IF NOT EXISTS Transaction ("
+"`id` BIGINT NOT NULL AUTO_INCREMENT,"
+"`blockNumber` BIGINT NOT NULL,"
+"`gas` VARCHAR(255) NULL,"
+"`gasPrice` VARCHAR(255) NULL,"
+"`hash` VARCHAR(255) NOT NULL,"
+"`input` LONGTEXT NULL,"
+"`input_hashcode` BIGINT NULL,"
+"`nonce` VARCHAR(255) NULL,"
+"`from` BIGINT NOT NULL,"
+"`to` BIGINT NOT NULL,"
+"`value` VARCHAR(255) NULL,"
+"PRIMARY KEY `id` (`id`),"
+"UNIQUE KEY `hash` (`hash`),"
+"KEY `blockNumber` (`blockNumber`),"
+"KEY `from` (`from`),"
+"KEY `to` (`to`),"
+"KEY `input_hashcode` (`input_hashcode`),"
+"CONSTRAINT FK_from FOREIGN KEY (`from`) REFERENCES `Address` (`id`),"
+"CONSTRAINT FK_to FOREIGN KEY (`to`) REFERENCES `Address` (`id`),"
+"CONSTRAINT FK_blockNumber FOREIGN KEY (`blockNumber`) REFERENCES `Block` (`id`)"
+")ENGINE=InnoDB;";

const CREATE_TABLE_BLOCK = "CREATE TABLE IF NOT EXISTS Block ("
+"`id` BIGINT NOT NULL AUTO_INCREMENT," //blockNumber
+"`blockHash` VARCHAR(255) NOT NULL,"
+"`timestamp` BIGINT NOT NULL," //blockNumber
+"PRIMARY KEY `id` (`id`),"
+"UNIQUE KEY `blockHash` (`blockHash`),"
+"KEY `timestamp` (`timestamp`)"
+")ENGINE=InnoDB;";

connection.query(CREATE_TABLE_ADDRESS, function(err, results, fields) {
  console.log("table creation finished", err);
  connection.query(CREATE_TABLE_BLOCK, function(err, results, fields) {
    console.log("table creation finished", err);
    connection.query(CREATE_TABLE_TRANSACTION, function(err, results, fields) {
      console.log("create table transaction", err);
    });
  });
});

module.exports = connection;
