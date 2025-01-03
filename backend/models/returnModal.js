// models/Return.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    item_id: { type: String, required: true },
    name: { type: String, required: true },
    returnPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    returnNo: { type: String, required: true, unique: true },
    returnType: { type: String, enum: ['bill', 'purchase'], required: true },

    // Bill return fields
    billingNo: { type: String },
    customerName: { type: String },
    customerAddress: { type: String },

    // Purchase return fields
    purchaseNo: { type: String },
    sellerName: { type: String },
    sellerAddress: { type: String },

    returnDate: { type: Date, required: true },
    discount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    returnAmount: { type: Number, required: true },
    netReturnAmount: { type: Number, required: true },

    products: [productSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Return', returnSchema);
