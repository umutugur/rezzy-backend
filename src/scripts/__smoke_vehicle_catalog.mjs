import assert from "node:assert";
import VehicleMake from "../models/VehicleMake.js";
import VehicleModel from "../models/VehicleModel.js";

// Unique indexes declared
const makeIdx = VehicleMake.schema.indexes().find(([k]) => k.countryCode && k.name);
assert(makeIdx && makeIdx[1].unique, "VehicleMake (countryCode,name) must be unique");
const modelIdx = VehicleModel.schema.indexes().find(([k]) => k.countryCode && k.make && k.name);
assert(modelIdx && modelIdx[1].unique, "VehicleModel (countryCode,make,name) must be unique");

// Required fields
assert(VehicleMake.schema.path("countryCode").isRequired, "make.countryCode required");
assert(VehicleModel.schema.path("make").isRequired, "model.make required");
console.log("vehicle catalog smoke ok");
