const mysql = require("mysql"),
config = require("../configs/blocks.js");

const _system_tables = [];

//TODO change connection object to wrapper
//TODO implement state management

var connection = mysql.createConnection({
  host     : config.mysql.host,
  user     : config.mysql.user,
  password : config.mysql.password,
  database : config.mysql.database
});

connection.connect();

var pool = mysql.createPool({
    connectionLimit: 100,
    host     : config.mysql.host,
    user     : config.mysql.user,
    password : config.mysql.password,
    database : config.mysql.database,
    debug: false
});

const CREATE_TABLE_ADDRESS = "CREATE TABLE IF NOT EXISTS Address ("
+"`id` BIGINT NOT NULL AUTO_INCREMENT,"
+"`address` VARCHAR(60) NOT NULL," //ethereum addresses are 20 bytes longs > 40 char bytes + 2 char bytes (0 + x)
+"PRIMARY KEY `id` (`id`),"
+"UNIQUE KEY `address` (`address`)"
+")ENGINE=InnoDB;";

const CREATE_TABLE_BLOCK = "CREATE TABLE IF NOT EXISTS Block ("
+"`id` BIGINT NOT NULL AUTO_INCREMENT," //blockNumber
+"`blockHash` VARCHAR(255) NOT NULL,"
+"`timestamp` BIGINT NOT NULL," //blockNumber
+"PRIMARY KEY `id` (`id`),"
+"UNIQUE KEY `blockHash` (`blockHash`),"
+"KEY `timestamp` (`timestamp`)"
+")ENGINE=InnoDB;";

function getTruncateTableBlock() {
  return "TRUNCATE TABLE Block";
}

function getTruncateTableAddress() {
  return "TRUNCATE TABLE Address";
}

function getTruncableTableRequest(suffix) {
  return "TRUNCATE TABLE Transaction"+suffix;
}

function getTransactionTableDropRequest(suffix) {
  return "DROP TABLE Transaction"+suffix;
}

function getTransactionTableCreationRequest(suffix) {
  return `CREATE TABLE IF NOT EXISTS Transaction${suffix} (`
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
    +"KEY `input_hashcode` (`input_hashcode`)"//+","
    //+"CONSTRAINT FK_from_T"+suffix+" FOREIGN KEY (`from`) REFERENCES `Address` (`id`),"
    //+"CONSTRAINT FK_to_T"+suffix+" FOREIGN KEY (`to`) REFERENCES `Address` (`id`),"
    //+"CONSTRAINT FK_blockNumber_T"+suffix+" FOREIGN KEY (`blockNumber`) REFERENCES `Block` (`id`)"
    //+")ENGINE=InnoDB;";
    +")ENGINE=MyISAM;";
  }


connection.init = function() {
  return new Promise((resolve, reject) => {
    connection.query(CREATE_TABLE_ADDRESS, function(err, results, fields) {
      console.log("table creation finished", err);
      connection.query(CREATE_TABLE_BLOCK, function(err, results, fields) {
        console.log("table creation finished", err);

        const promises = [];
        const letters = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];

        const tables = [];
        letters.forEach(letter => {
          letters.forEach(letter2 => {
            //letters.forEach(letter3 => {
              tables.push("_"+letter+""+letter2);//+""+letter3);
            //})
          })
        });
        tables.push("_"); //Transaction_


        tables.forEach(table => {
          console.log("executing for table "+ table + " " + table.length);
          _system_tables.push("Transaction"+table);
          promises.push(new Promise((resolve, reject) => {
            connection.query(getTransactionTableCreationRequest(table), function(err, results, fields) {
              if(err) reject(err);
              else resolve(results);
            });
          }));
        });

        Promise.all(promises)
        .then(results => {
          connection._init = true;
          resolve(results);
        })
        .catch(err => {
          reject(err);
          console.log("error", err);
        });

      });
    });

  });
}

connection.system_tables = _system_tables;
connection.pool = pool;

module.exports = connection;
