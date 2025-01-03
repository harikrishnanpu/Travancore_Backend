// models/transportationModel.js
import mongoose from 'mongoose';

const transportationSchema = new mongoose.Schema(
  {
    purchaseId: { type: String, required: true },
    invoiceNo: { type: String, required: true },
    transportType: { type: String, default: 'general' }, // e.g., "general" or "local"
    companyGst: { type: String },
    billId: { type: String },
    transportCompanyName: { type: String, required: true },
    transportationCharges: { type: Number, required: true },
    remarks: { type: String },
    billingDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Transportation = mongoose.model('Transportation', transportationSchema);
export default Transportation;
