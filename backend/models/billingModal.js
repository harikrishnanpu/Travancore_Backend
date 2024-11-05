import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  invoiceDate: { type: Date, required: true },
  salesmanName: { type: String, required: true },
  expectedDeliveryDate: { type: Date, required: true },
  deliveryStatus: { type: String, required: true },
  billingAmount: { type: String, required: true },
  paymentStatus: { type: String, required: true },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  kmTravelled: { type: String, required: true, default: "0"},
  fuelCharge: { type: String, required: true, default: "0"},
  otherExpenses: { type: String, required: true, default: "0"},
  products: [
    {
      item_id: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number },
      category: { type: String, required: true },
      brand: { type: String, required: true },
      quantity: { type: Number, required: true },
      deliveryStatus: { type: String, default: "Pending" }, // New field to track delivery status of each product
    },
  ],
  payments: [
    {
      amount: { type: Number, required: true },
      method: { type: String, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
}, { timestamps: true });

// Add static method to calculate total quantity sold
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

// Add method to update delivery status based on product statuses
BillingSchema.methods.updateDeliveryStatus = async function () {
  const allDelivered = this.products.every(product => product.deliveryStatus === "Delivered");
  this.deliveryStatus = allDelivered ? "Delivered" : "Pending";
  await this.save();
};

// Add method to add payment and update payment status
BillingSchema.methods.addPayment = async function (amount) {
  const currentAmount = parseFloat(this.billingAmountReceived || 0);
  const updatedAmount = currentAmount + parseFloat(amount);
  this.billingAmountReceived = updatedAmount;

  if (updatedAmount >= parseFloat(this.billingAmount)) {
    this.paymentStatus = "Paid";
  } else {
    this.paymentStatus = "Partial";
  }
  await this.save();
};

const Billing = mongoose.model('Billing', BillingSchema);

export default Billing;
