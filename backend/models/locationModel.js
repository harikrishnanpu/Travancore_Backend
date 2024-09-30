import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true }, // unique index
    name: { type: String, required: true },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  });
  
  const Location = mongoose.model('Location', locationSchema);
  export default Location