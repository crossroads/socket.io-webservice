var intFormat = require("biguint-format");
var FlakeId = require("flake-idgen");
var config = require("./config.js");
var idGen = new FlakeId(config.flakeid || {});

module.exports = function() {
  return intFormat(idGen.next(), "dec");
};
