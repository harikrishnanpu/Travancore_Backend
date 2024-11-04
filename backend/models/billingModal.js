import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  invoiceDate: { type: Date, required: true },
  salesmanName: { type: String, required: true },
  expectedDeliveryDate: { type: Date, required: true },
  deliveryStatus: { type: String, required: true },
  billingAmount: {type: String, require: true},
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
},{  timestamps: true });



// Add this static method to the BillingSchema
BillingSchema.statics.getTotalQuantitySold = async function (itemId) {
  const result = await this.aggregate([
    { $unwind: "$products" }, // Unwind the products array to access each product individually
    { $match: { "products.item_id": itemId } }, // Match only documents with the specified item_id
    {
      $group: {
        _id: "$products.item_id",
        totalQuantity: { $sum: "$products.quantity" }, // Sum up the quantity for the specified item_id
      },
    },
  ]);

  // Return the total quantity or 0 if the item has no sales
  return result[0] ? result[0].totalQuantity : 0;
};


const Billing = mongoose.model('Billing', BillingSchema);

export default Billing