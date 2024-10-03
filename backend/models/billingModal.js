import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  salesmanName: { type: String, required: true },
  expectedDeliveryDate: { type: Date, required: true },
  deliveryStatus: { type: String, required: true },
  paymentStatus: { type: String, required: true },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  products: [
    {
      item_id: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number},
      category: { type: String, required: true },
      brand: { type: String, required: true },
      quantity: { type: Number, required: true },
    }
  ],
});

const Billing = mongoose.model('Billing', BillingSchema);

export default Billing