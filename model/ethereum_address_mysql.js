const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
connection = require("../database/init");
const NodeCache = require("node-cache");

const CACHE = new NodeCache( { stdTTL: 100, checkperiod: 120 } );

const COLUMNS = ["address"];

function createInsertRows() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "INSERT INTO Address ("+columns.join(",")+") VALUES ? ";
}

function selectColumns() {
  var columns = COLUMNS.map((col) => { return "`"+col+"`"; });
  return "SELECT `id`, "+columns.join(",")+" FROM Address";
}

const INSERT_ROWS = createInsertRows();

function rowToJson(row) {
  return {
    id: row.id,
    address: row.address.toLowerCase()
  }
}

const EthereumAddressMysqlModel = function() {

}

Abstract.make_inherit(EthereumAddressMysqlModel);

EthereumAddressMysqlModel.prototype.getModelName = function() {
  return "Address";
}


EthereumAddressMysqlModel.prototype.exists = function(address) {
  return new Promise((resolve, reject) => {
    address = address.toLowerCase();
    connection.query("SELECT address FROM Address WHERE address = ? ", [address],  (error, results, fields) => {
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
}

EthereumAddressMysqlModel.prototype.getOrSave = function(address) {
  return new Promise((resolve, reject) => {
    this.get(address)
    .then(json => {
      if(json) {
        resolve(json);
      } else {
        this.save(address)
        .then(json => resolve(json))
        .catch(err => reject(err));
      }
    })
    .catch(err => reject(err));
  });
}


EthereumAddressMysqlModel.prototype.getFromId = function(id) {
  return new Promise((resolve, reject) => {
    const json = CACHE.get(id);
    if(json) {
      resolve(json);
      return;
    }

    connection.query(selectColumns()+" WHERE address = ? ", [address],  (error, results, fields) => {
      if(error) {
        reject(error);
        return;
      }
      if(results && results.length > 0) {
        const json = rowToJson(results[0]);
        CACHE.set(json.id, json);
        CACHE.set(json.address, json);
        resolve(json);
      } else {
        resolve(undefined);
      }
    });
  });
}

EthereumAddressMysqlModel.prototype.get = function(address) {
  return new Promise((resolve, reject) => {
    const json = CACHE.get(address);
    if(json) {
      resolve(json);
      return;
    }

    connection.query(selectColumns()+" WHERE address = ? ", [address],  (error, results, fields) => {
      if(error) {
        reject(error);
        return;
      }
      if(results && results.length > 0) {
        const json = rowToJson(results[0]);
        CACHE.set(json.id, json);
        CACHE.set(json.address, json);
        resolve(json);
      } else {
        resolve(undefined);
      }
    });
  });
}

EthereumAddressMysqlModel.prototype.save = function(address) {
  return new Promise((resolve, reject) => {
    connection.query("INSERT INTO Address (`address`) VALUES (?)", [address], (error, results, fields) => {
      if(error) {
        if(error.code == "ER_DUP_ENTRY") {
          this.get(address)
          .then(json => resolve(json))
          .catch(err => reject(err));
        } else {
          reject(error);
        }
      } else {
        const json = {
          id: results.insertId,
          address: address
        }
        CACHE.set(json.id, json);
        CACHE.set(json.address, json);
        resolve(json);
      }
    });
  });
}

module.exports = new EthereumAddressMysqlModel();
