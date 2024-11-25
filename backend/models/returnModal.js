import mongoose from "mongoose";

const returnSchema = mongoose.Schema(
  {
    returnNo: { type: String, required: true, unique: true },
    billingNo: { type: String, required: true },
    returnDate: { type: Date, required: true },
    customerName: { type: String, required: true },
    customerAddress: { type: String, required: true },
    products: [
      {
        item_id: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    // New fields for amounts
    returnAmount: { type: Number, required: true },
    totalTax: { type: Number, required: true },
    netReturnAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

const Return = mongoose.model('Return', returnSchema);

export default Return;
