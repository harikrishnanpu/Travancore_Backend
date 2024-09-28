import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coordinates: { 
        type: [Number], // [longitude, latitude]
        required: true 
    },
    timestamp: { type: Date, default: Date.now },
    name: {type: String}
});

locationSchema.index({ coordinates: '2dsphere' });

const Location = mongoose.model('Location', locationSchema);
export default Location
