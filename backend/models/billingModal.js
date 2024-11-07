import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  invoiceDate: { type: Date, required: true },
  salesmanName: { type: String, required: true },
  expectedDeliveryDate: { type: Date, required: true },
  deliveryStatus: { type: String, default: "Pending" },
  billingAmount: { type: Number, required: true },
  billingAmountReceived: { type: Number, default: 0 },
  paymentStatus: { type: String, required: true, default: "Unpaid" },
  customerName: { type: String, required: true },
  customerAddress: { type: String, required: true },
  customerContactNumber: { type: String },
  kmTravelled: { type: Number, default: 0 },
  startingKm: { type: Number, default: 0 },
  endKm: { type: Number, default: 0 },
  fuelCharge: { type: Number, default: 0 },
  otherExpenses: [
    {
      amount: { type: Number},
      remark: { type: String},
      date: { type: Date, default: Date.now },
    },
  ],
  products: [
    {
      item_id: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number },
      category: { type: String, required: true },
      brand: { type: String, required: true },
      quantity: { type: Number, required: true },
      deliveryStatus: { type: String, default: "Pending" },
    },
  ],
  payments: [
    {
      amount: { type: Number, required: true },
      method: { type: String, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
  notes: { type: String },
}, { timestamps: true });

// Virtual field for calculating total other expenses
BillingSchema.virtual("totalOtherExpenses").get(function () {
  return this.otherExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
});

// Static method to calculate total quantity sold
BillingSchema.statics.getTotalQuantitySold = async function (itemId) {
  const result = await this.aggregate([
    { $unwind: "$products" },
    { $match: { "products.item_id": itemId } },
    {
      $group: {
        _id: "$products.item_id",
        totalQuantity: { $sum: "$products.quantity" },
      },
    },
  ]);
  return result[0] ? result[0].totalQuantity : 0;
};

// Method to update delivery status based on product statuses
BillingSchema.methods.updateDeliveryStatus = async function () {
  const allDelivered = this.products.every(product => product.deliveryStatus === "Delivered");
  const someDelivered = this.products.some(product => product.deliveryStatus === "Delivered");
  
  this.deliveryStatus = allDelivered ? "Delivered" : someDelivered ? "Partially Delivered" : "Pending";
  await this.save();
};

// Method to add payment and update payment status
BillingSchema.methods.addPayment = async function (amount, method) {
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  this.billingAmountReceived += parseFloat(amount);
  this.payments.push({ amount: parseFloat(amount), method });

  if (this.billingAmountReceived >= this.billingAmount) {
    this.paymentStatus = "Paid";
  } else {
    this.paymentStatus = "Partial";
  }
  
  await this.save();
};

const Billing = mongoose.model("Billing", BillingSchema);

export default Billing;
