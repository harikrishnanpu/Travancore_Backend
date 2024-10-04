import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema(
  {
    sellerName: { type: String, required: true },
    sellerId: { type: String, required: true },
    invoiceNo: { type: String, required: true },
    items: [
      {
        itemId: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        brand: {type: String, required: true},
        category: {type: String, required: true},
        price: {type: String, required: true}
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);

export default Purchase