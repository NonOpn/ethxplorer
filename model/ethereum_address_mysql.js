const Abstract = require("./abstract.js"),
config = require("../configs/blocks.js"),
murmurHash = require('murmurhash-native').murmurHash,
connection = require("../database/init");
const NodeCache = require("node-cache");

const CACHE = new NodeCache( { stdTTL: 10000, checkperiod: 120 } );

const COLUMNS = ["address", "is_api_sync"];

function createInsertRows() {
  var columns = COLUMNS.map((col) => "`"+col+"`");
  return "INSERT INTO Address ("+columns.join(",")+") VALUES ? ";
}

function selectColumns() {
  var columns = COLUMNS.map((col) => "`"+col+"`");
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
  this._extra_light_cache = {length: 0};
  this._extra_light_cache_init = false;
}

Abstract.make_inherit(EthereumAddressMysqlModel);

EthereumAddressMysqlModel.prototype.getModelName = function() {
  return "Address";
}


EthereumAddressMysqlModel.prototype.exists = function(address) {
  return new Promise((resolve, reject) => {
    address = address.toLowerCase();
    connection.executeInPool("SELECT address FROM Address WHERE address = ? ", [address])
    .then(results => {
      resolve(results && results.length > 0);
    })
    .catch(err => {
      reject(err);
    })
  });
}

EthereumAddressMysqlModel.prototype.setApiSync = function(address, is_api_sync) {
  var json = undefined;
  address = address.toLowerCase();
  return new Promise((resolve, reject) => {
    this.getOrSave(address)
    .then(result => {
      json = result;
      return connection.executeInPool("UPDATE Address SET is_api_sync = ? WHERE address = ? ", [is_api_sync, address])
    })
    .then(results => {
      json.is_api_sync = is_api_sync;
      //update cache
      CACHE.set(json.id, json);
      CACHE.set(json.address, json);


      if(!this._extra_light_cache[json.address]) {
        this._extra_light_cache[json.address] = json.id;
        this._extra_light_cache.length ++;
      }

      resolve(json);
    })
    .catch(err => reject(err));
  });
}

EthereumAddressMysqlModel.prototype.isApiSync = function(address) {
  return new Promise((resolve, reject) => {
    this.getOrSave(address, true)
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
      if(!json) return this.save(address)
      return new Promise((resolve) => resolve(json));
    })
    .then(json => resolve(json))
    .catch(err => reject(err));
  });
}

EthereumAddressMysqlModel.prototype.canSave = function(from, to) {
  if(this._light) {
    return new Promise((resolve, reject) => {
      var from_json = undefined;
      var to_json = undefined;

      this.get(from, true)
      .then(obtained => {
        from_json = obtained;
        return this.get(to, true);
      })
      .then(obtained => {
        to_json = obtained;

        if(from_json && from_json.is_api_sync) resolve(true);
        else if(to_json && to_json.is_api_sync) resolve(true);
        else resolve(false);
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
  if(this._light) {
    return new Promise((resolve) => resolve(true) );
  } else {
    return this.saveMultiple(addresses);
  }
}

EthereumAddressMysqlModel.prototype.canSync = function() {
  if(this._extra_light_cache_init) {
    return new Promise((resolve) => resolve(true));
  } else if(this._light) {
    return new Promise((resolve, reject) => {
      connection.executeInPool("SELECT id, address FROM Address WHERE is_api_sync = TRUE LIMIT 10000")
      .then(results => {
        if(results.length > 0) {
          if(results.length < 10000) {
            this._extra_light_cache = {};
            results.forEach(result => this._extra_light_cache[result.address] = result.id);
            console.log(this._extra_light_cache);
            this._extra_light_cache.length = results.length;
          }
          this._extra_light_cache_init = true;
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch(error => {
        console.log(error);
        resolve(false);
      });
    });
  } else {
    //is normal mode, always sync
    return new Promise((resolve) => resolve(true));
  }
}


EthereumAddressMysqlModel.prototype.getFromId = function(id) {
  return new Promise((resolve, reject) => {
    const json = CACHE.get(id);
    if(json) {
      resolve(json);
      return;
    }

    connection.executeInPool(selectColumns()+" WHERE address = ? ", [address])
    .then(results => {
      if(results.length > 0) {
        const json = rowToJson(results[0]);
        CACHE.set(json.id, json);
        CACHE.set(json.address, json);
        resolve(json);
      } else {
        resolve(undefined);
      }
    })
    .catch(error => {
      reject(error);
    });
  });
}

EthereumAddressMysqlModel.prototype.get = function(address, fast) {
  return new Promise((resolve, reject) => {
    if(this._extra_light_cache[address]) {
      resolve({
        id: this._extra_light_cache[address],
        address: address,
        is_api_sync: true
      });
      return;
    } else if(fast && this._extra_light_cache.length > 0) {
      //if we are in fast search for API SYNC addresses only
      resolve(undefined);
      return;
    }

    const json = CACHE.get(address);
    if(json) {
      resolve(json);
      return;
    }

    connection.executeInPool(selectColumns()+" WHERE address = ? ", [address])
    .then(results => {
      if(results.length > 0) {
        const json = rowToJson(results[0]);
        CACHE.set(json.id, json);
        CACHE.set(json.address, json);
        resolve(json);
      } else {
        resolve(undefined);
      }
    })
    .catch(error => {
      reject(error);
    });
  });
}

EthereumAddressMysqlModel.prototype.save = function(address) {
  return new Promise((resolve, reject) => {
    connection.executeInPool("INSERT INTO Address (`address`) VALUES (?)", [address])
    .then(results => {
      const json = {
        id: results.insertId,
        address: address
      }
      CACHE.set(json.id, json);
      CACHE.set(json.address, json);
      resolve(json);
    })
    .catch(error => {
      if(error.code == "ER_DUP_ENTRY") {
        setTimeout(() => {
          //prevent issues with sub-tick calls
          this.get(address)
          .then(json => resolve(json))
          .catch(err => reject(err));
        }, 1000);
      } else {
        reject(error);
      }
    });
  });
}

EthereumAddressMysqlModel.prototype.saveMultiple = function(addresses) {
  return new Promise((resolve, reject) => {
    if(addresses.length == 0) {
      resolve(true);
    } else {
      const to_save = addresses.map(address => [address]);

      connection.executeInPool("INSERT IGNORE INTO Address (`address`) VALUES ?", [to_save])
      .then(results => {
        resolve(true);
      })
      .catch(error => {
        if(error.code == "ER_DUP_ENTRY") {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    }
  });
}

EthereumAddressMysqlModel.prototype.isLight = function() {
  return this._light;
}

module.exports = new EthereumAddressMysqlModel();
