const mongoose = require("mongoose");

module.exports = {
  generateModel: function(scheme, name, methods) {
    var Scheme = mongoose.Schema(scheme);

    if(methods != undefined) {
      methods.forEach(function(method) {
        Scheme.methods[method.name] = method.func;
      });
    }

    return mongoose.model(name, Scheme);
  },

  to_json: function(callback) {
    return {
      name: "to_json",
      func: callback
    }
  }
}
