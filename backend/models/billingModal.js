// models/Billing.js
import mongoose from "mongoose";

const BillingSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: String },
    submittedBy: { type: String },
    invoiceDate: { type: Date, required: true },
    showroom: { type: String, required: true },
    salesmanName: { type: String, required: true },
    salesmanPhoneNumber: { type: String },
    expectedDeliveryDate: { type: Date, required: true },
    deliveryStatus: { type: String, default: "Pending" },
    grandTotal: { type: Number, required: true },
    billingAmount: { type: Number, required: true }, // Total before discount
    discount: { type: Number, default: 0 },
    billingAmountReceived: { type: Number, default: 0 },
    paymentStatus: { type: String, required: true, default: "Unpaid" },
    customerId: { type: String, required: true },
    customerName: { type: String, required: true },
    customerAddress: { type: String, required: true },
    customerContactNumber: { type: String },

    // Removed kmTravelled, startingKm, endKm, fuelCharge fields from the main level

    marketedBy: { type: String },
    unloading: { type: Number, default: 0 },
    transportation: { type: Number, default: 0 },
    handlingCharge: { type: Number, default: 0 },
    remark: { type: String, default: "" },

    // "otherExpenses" at the billing level
    otherExpenses: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        amount: { type: Number },
        remark: { type: String },
        date: { type: Date, default: Date.now },
        method: { type: String },
        referenceId: { type: String },
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
        deliveredQuantity: { type: Number, default: 0 },
        deliveryStatus: { type: String, default: "Pending" },
        gstRate: { type: Number, required: true },
      },
    ],

    payments: [
      {
        amount: { type: Number, required: true },
        method: { type: String, required: true },
        referenceId: { type: String, required: true },
        date: { type: Date, default: Date.now },
        remark: { type: String },
        invoiceNo: { type: String, required: true },
      },
    ],

    deliveryIds: [String],

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
            psRatio: String,
          },
        ],
        deliveryStatus: String,
        kmTravelled: Number,
        startingKm: Number,
        endKm: Number,
        fuelCharge: Number, // Fuel charge specific to this delivery
        method: String,
        otherExpenses: [
          {
            _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
            amount: Number,
            remark: String,
            method: String,
            date: { type: Date, default: Date.now },
          },
        ],
      },
    ],

    notes: { type: String },

    // Newly added fields for totals
    totalFuelCharge: { type: Number, default: 0 },
    totalOtherExpenses: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Method to add a new payment and update billingAmountReceived and payment status
BillingSchema.methods.addPayment = async function (payment) {
  if (payment.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  // Add the new payment
  this.payments.push(payment);

  // Recalculate the total payments received
  this.billingAmountReceived = this.payments.reduce(
    (total, payment) => total + (payment.amount || 0),
    0
  );

  // Calculate net amount after discount
  const netAmount = this.grandTotal || 0;

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

// Method to recalculate totalFuelCharge and totalOtherExpenses
BillingSchema.methods.calculateTotals = function () {
  // Sum top-level other expenses
  const topLevelOtherExpenses = this.otherExpenses.reduce((acc, expense) => acc + (expense.amount || 0), 0);

  // Sum deliveries' fuel charges and other expenses
  let deliveryFuelTotal = 0;
  let deliveryOtherExpenseTotal = 0;

  for (const delivery of this.deliveries) {
    if (delivery.fuelCharge) {
      deliveryFuelTotal += delivery.fuelCharge;
    }

    if (delivery.otherExpenses && delivery.otherExpenses.length > 0) {
      deliveryOtherExpenseTotal += delivery.otherExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    }
  }

  // Update totals
  this.totalFuelCharge = deliveryFuelTotal;
  this.totalOtherExpenses = topLevelOtherExpenses + deliveryOtherExpenseTotal;
};

// Pre-save hook to update billingAmountReceived, payment status, and totals
BillingSchema.pre("save", function (next) {
  // Calculate total received from payments
  this.billingAmountReceived = this.payments.reduce(
    (total, payment) => total + (payment.amount || 0),
    0
  );

  // Calculate net amount after discount
  const netAmount = this.grandTotal || 0;

  // Update the payment status
  if (this.billingAmountReceived >= netAmount) {
    this.paymentStatus = "Paid";
  } else if (this.billingAmountReceived > 0) {
    this.paymentStatus = "Partial";
  } else {
    this.paymentStatus = "Unpaid";
  }

  // Recalculate totals for fuel charge and other expenses
  this.calculateTotals();

  next();
});

// Method to update delivery status based on product delivery quantities
BillingSchema.methods.updateDeliveryStatus = function () {
  const allDelivered = this.products.every(
    (product) => product.deliveryStatus === "Delivered"
  );
  const anyDelivered = this.products.some(
    (product) =>
      product.deliveryStatus === "Delivered" ||
      product.deliveryStatus === "Partially Delivered"
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
