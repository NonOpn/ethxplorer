const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
connection = require("../database/init");

const pool = connection.pool;

const COLUMNS = ["id", "blockHash", "timestamp"];

function createInsertRows() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "INSERT INTO Block ("+columns.join(",")+") VALUES ? ";
}

function selectColumns() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "SELECT "+columns.join(",")+" FROM Block";
}

const INSERT_ROWS = createInsertRows();

function rowToJson(row) {
  return {
    blockNumber: row.id,
    blockHash: row.blockHash,
    timestamp: row.timestamp
  }
}

const EthereumBlockMysqlModel = function() {

}

Abstract.make_inherit(EthereumBlockMysqlModel);

EthereumBlockMysqlModel.prototype.getModelName = function() {
  return "Block";
}


EthereumBlockMysqlModel.prototype.exists = function(blockNumber) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query("SELECT id FROM Block WHERE id = ? ", [blockNumber],  (error, results, fields) => {
        connection.release();
        if(error) {
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  });
}

EthereumBlockMysqlModel.prototype.lastBlockNumber = function() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query("SELECT MAX(id) as c FROM Block",  (error, results, fields) => {
        connection.release();
        if(error) {
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(results[0].c);
        } else {
          resolve(0);
        }
      });
    });
  });
}

EthereumBlockMysqlModel.prototype.getOrSave = function(block) {
  return new Promise((resolve, reject) => {
    this.get(block.number)
    .then(json => {
      if(json) {
        resolve(json)
      } else {
        this.save(block)
        .then(json => resolve(json))
        .catch(err => reject(err));
      }
    })
    .catch(err => reject(err));
  });
}

EthereumBlockMysqlModel.prototype.get = function(blockNumber) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query(selectColumns()+" WHERE id = ? ", [blockNumber],  (error, results, fields) => {
        connection.release();
        if(error) {
          reject(error);
          return;
        }

        if(results && results.length > 0) {
          resolve(rowToJson(results[0]));
        } else {
          resolve(undefined);
        }
      });
    });
  });
}

EthereumBlockMysqlModel.prototype.save = function(block) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query("INSERT INTO Block (`id`, `blockHash`, `timestamp`) VALUES (?, ?, ?)", [block.number, block.hash, block.timestamp], (error, results, fields) => {
        connection.release();
        if(error) {
          if(error.code == "ER_DUP_ENTRY") {
            this.get(block.number)
            .then(json => resolve(json))
            .catch(err => reject(err));
          } else {
            reject(error);
          }
        } else {
          resolve({
            blockNumber: block.number,//results.insertId,
            blockHash: block.hash,
            timestamp: block.timestamp
          });
        }
      });
    });
  });
}

module.exports = new EthereumBlockMysqlModel();
