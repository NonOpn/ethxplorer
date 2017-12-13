const mysql = require("mysql"),
Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
connection = require("../database/init");
const NodeCache = require("node-cache");

const pool = connection.pool;
const CACHE = new NodeCache( { stdTTL: 10000, checkperiod: 120 } );

const COLUMNS = ["address", "is_api_sync"];

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
    address: row.address.toLowerCase(),
    is_api_sync: row.is_api_sync == true || row.is_api_sync > 0
  }
}

const EthereumAddressMysqlModel = function() {
  this._light = config.light;
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

EthereumAddressMysqlModel.prototype.setApiSync = function(address, is_api_sync) {
  return new Promise((resolve, reject) => {
    this.getOrSave(address)
    .then(json => {
      pool.getConnection((err, connection) => {
        if(err) console.log(err);
        connection.query("UPDATE Address SET is_api_sync = ? WHERE address = ? ", [is_api_sync, address],  (error, results, fields) => {
          connection.release();

          json.is_api_sync = is_api_sync;
          //update cache
          CACHE.set(json.id, json);
          CACHE.set(json.address, json);

          resolve(json);
        });
      });
    })
    .catch(err => reject(err));
  });
}

EthereumAddressMysqlModel.prototype.isApiSync = function(address) {
  return new Promise((resolve, reject) => {
    this.getOrSave(address)
    .then(json => {
      resolve(json != null && json.is_api_sync);
    })
    .catch(err => reject(err));
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

EthereumAddressMysqlModel.prototype.canSave = function(from, to) {
  if(this._light) {
    return new Promise((resolve, reject) => {
      var from_json = undefined;
      var to_json = undefined;

      this.get(from)
      .then(obtained => {
        from_json = obtained;
        return this.get(to);
      })
      .then(obtained => {
        to_json = obtained;

        if(from_json && from_json.is_api_sync) resolve(true);
        else if(to_json && to_json.is_api_sync) resolve(true);
        resolve(false);
      })
      .catch(err => reject(err));
    })
  } else {
    return new Promise((resolve, reject) => {
      resolve(true);
    });
  }
}

EthereumAddressMysqlModel.prototype.manageAddresses = function(addresses) {
  //always save addresses
  if(this._light) {
    return new Promise((resolve, reject) => {
      resolve(true);
    })
  } else {
    return this.saveMultiple(addresses);
  }
}

EthereumAddressMysqlModel.prototype.canSync = function() {
  if(this._light) {
    return new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        connection.query("SELECT address FROM Address WHERE is_api_sync = TRUE LIMIT 1",  (error, results, fields) => {
          connection.release();
          if(results && results.length > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    });
  } else {
    //is normal mode, always sync
    return new Promise((resolve, reject) => {
      resolve(true);
    });
  }
}


EthereumAddressMysqlModel.prototype.getFromId = function(id) {
  return new Promise((resolve, reject) => {
    const json = CACHE.get(id);
    if(json) {
      resolve(json);
      return;
    }

    pool.getConnection((err, connection) => {
      connection.query(selectColumns()+" WHERE address = ? ", [address],  (error, results, fields) => {
        connection.release();
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
  });
}

EthereumAddressMysqlModel.prototype.get = function(address) {
  return new Promise((resolve, reject) => {
    const json = CACHE.get(address);
    if(json) {
      resolve(json);
      return;
    }

    pool.getConnection((err, connection) => {
      if(err) console.log(err);
      connection.query(selectColumns()+" WHERE address = ? ", [address],  (error, results, fields) => {
        connection.release();
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
  });
}

EthereumAddressMysqlModel.prototype.save = function(address) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query("INSERT INTO Address (`address`) VALUES (?)", [address], (error, results, fields) => {
        connection.release();
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
  });
}

EthereumAddressMysqlModel.prototype.saveMultiple = function(addresses) {
  return new Promise((resolve, reject) => {
    if(addresses.length == 0) {
      resolve(true);
    } else {
      const to_save = [];
      addresses.forEach(address => { to_save.push([address])});

      pool.getConnection((err, connection) => {
        connection.query("INSERT IGNORE INTO Address (`address`) VALUES ?", [to_save], (error, results, fields) => {
          connection.release();
          if(error) {
            console.log(error);
            if(error.code == "ER_DUP_ENTRY") {
              resolve(true);
            } else {
              resolve(false);
            }
          } else {
            resolve(true);
          }
        });
      });
    }
  });
}

EthereumAddressMysqlModel.prototype.isLight = function() {
  return this._light;
}

module.exports = new EthereumAddressMysqlModel();
