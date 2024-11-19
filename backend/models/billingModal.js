// models/Billing.js
import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    isApproved: { type: Boolean, default: false},
    approvedBy: { type: String},
    submittedBy: { type: String },
    invoiceDate: { type: Date, required: true },
    salesmanName: { type: String, required: true },
    expectedDeliveryDate: { type: Date, required: true },
    deliveryStatus: { type: String, default: "Pending" },
    billingAmount: { type: Number, required: true }, // Total before discount
    discount: { type: Number, default: 0 },
    billingAmountReceived: { type: Number, default: 0 },
    paymentStatus: { type: String, required: true, default: "Unpaid" },
    customerName: { type: String, required: true },
    customerAddress: { type: String, required: true },
    customerContactNumber: { type: String },
    kmTravelled: { type: Number, default: 0 },
    startingKm: { type: Number, default: 0 },
    endKm: { type: Number, default: 0 },
    fuelCharge: { type: Number, default: 0 },
    marketedBy: { type: String },
    otherExpenses: [
      {
        amount: { type: Number },
        remark: { type: String },
        date: { type: Date, default: Date.now },
      },
    ],
    products: [
      {
        item_id: { type: String, required: true },
        name: { type: String, required: true },
        sellingPrice: { type: Number, required: true },
        category: { type: String, required: true },
        unit: { type: String, required: true },
        brand: { type: String, required: true },
        quantity: { type: Number, required: true },
        enteredQty: { type: Number, required: true },
        length: { type: String, required: true },
        breadth: { type: String, required: true },
        size: { type: String, required: true },
        psRatio: { type: String, required: true },
        sellingPriceinQty: { type: Number, required: true },
        deliveredQuantity: { type: Number, default: 0 }, // New field
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
    deliveryIds: [String], // Keep track of all delivery IDs related to this billing
    deliveries: [
      {
        deliveryId: { type: String, required: true },
        userId: String,
        driverName: String,
        startLocations: [
          {
            coordinates: [Number],
            timestamp: Date,
          },
        ],
        endLocations: [
          {
            coordinates: [Number],
            timestamp: Date,
          },
        ],
        productsDelivered: [
          {
            item_id: String,
            deliveredQuantity: Number,
          },
        ],
        deliveryStatus: String,
        kmTravelled: Number,
        startingKm: Number,
        endKm: Number,
        fuelCharge: Number,
        otherExpenses: [
          {
            amount: Number,
            remark: String,
            date: { type: Date, default: Date.now }, // Added date field
          },
        ],
      },
    ],
    notes: { type: String },
  },
  { timestamps: true }
);

// Method to add a new payment and update billingAmountReceived and payment status
BillingSchema.methods.addPayment = async function (amount, method) {
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Add the new payment
  this.payments.push({ amount: parseFloat(amount), method });

  // Recalculate the total payments received
  this.billingAmountReceived = this.payments.reduce(
    (total, payment) => total + (payment.amount || 0),
    0
  );

  // Calculate net amount after discount
  const netAmount = this.billingAmount - (this.discount || 0);

  // Update the payment status based on the total amount received vs net amount
  if (this.billingAmountReceived >= netAmount) {
    this.paymentStatus = "Paid";
  } else if (this.billingAmountReceived > 0) {
    this.paymentStatus = "Partial";
  } else {
    this.paymentStatus = "Unpaid";
  }

  await this.save();
};

// Static method to calculate total quantity sold for a given item
BillingSchema.statics.getTotalQuantitySold = async function (itemId) {
  try {
    const result = await this.aggregate([
      { $unwind: "$products" }, // Unwind the products array to access each product individually
      { $match: { "products.item_id": itemId.trim() } }, // Match the specific item by item_id
      {
        $group: {
          _id: "$products.item_id",
          totalQuantity: { $sum: "$products.quantity" }, // Sum the quantity of the product sold
        },
      },
    ]);

    // If no results found, return 0
    return result.length > 0 ? result[0].totalQuantity : 0;
  } catch (error) {
    console.error("Error in getTotalQuantitySold:", error);
    return 0; // Return 0 in case of any error
  }
};

// Pre-save hook to update billingAmountReceived and payment status
BillingSchema.pre("save", function (next) {
  // Calculate total received from payments
  this.billingAmountReceived = this.payments.reduce(
    (total, payment) => total + (payment.amount || 0),
    0
  );

  // Calculate net amount after discount
  const netAmount = this.billingAmount - (this.discount || 0);

  // Update the payment status
  if (this.billingAmountReceived >= netAmount) {
    this.paymentStatus = "Paid";
  } else if (this.billingAmountReceived > 0) {
    this.paymentStatus = "Partial";
  } else {
    this.paymentStatus = "Unpaid";
  }

  next();
});

// Method to update delivery status based on product delivery quantities
BillingSchema.methods.updateDeliveryStatus = function () {
  // Determine overall delivery status based on product delivery statuses
  const allDelivered = this.products.every((product) => product.deliveryStatus === "Delivered");
  const anyDelivered = this.products.some(
    (product) => product.deliveryStatus === "Delivered" || product.deliveryStatus === "Partially Delivered"
  );

  if (allDelivered) {
    this.deliveryStatus = "Delivered";
  } else if (anyDelivered) {
    this.deliveryStatus = "Partially Delivered";
  } else {
    this.deliveryStatus = "Pending";
  }

  return this.save();
};

const Billing = mongoose.model("Billing", BillingSchema);

export default Billing;
