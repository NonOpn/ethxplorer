module.exports = {
  wait: function(timeout = 10) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve()
      }, timeout * 1000);
    });
  }
}
