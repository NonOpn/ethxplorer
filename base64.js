module.exports = {
  from0x: function(string) {
    string = string.replace("0x","").toLowerCase();
    return Buffer.from(string, "hex").toString("base64");
  },
  to0x: function(base64) {
    const string = Buffer.from(base64, "base64").toString("hex");
    return "0x" + string.toLowerCase();
  }
}
