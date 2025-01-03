// models/TransportPayment.js
import mongoose from 'mongoose';

const transportPaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  billId: { type: String, required: true },
  method: { type: String, required: true }, // e.g. "cash", "card"
  submittedBy: { type: String, required: true },
  date: { type: Date, default: Date.now },
  referenceId: { type: String, required: true },
  remark: { type: String },
});

const transportBillingSchema = new mongoose.Schema({
  billId: { type: String, required: true },
  invoiceNo: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

const transportPaymentAggregateSchema = new mongoose.Schema(
  {
    transportName: { type: String, required: true },
    transportType: { type: String, required: true }, // e.g., "general", "local"
    transportGst: { type: String },
    payments: [transportPaymentSchema],  // Detailed payments
    billings: [transportBillingSchema],  // Detailed billings
    totalAmountBilled: { type: Number, default: 0 },
    totalAmountPaid: { type: Number, default: 0 },
    paymentRemaining: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Add or recalc logic
transportPaymentAggregateSchema.methods.addPayment = function (payment) {
  this.payments.push(payment);
  this.totalAmountPaid += payment.amount;
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

transportPaymentAggregateSchema.methods.addBilling = function (billing) {
  this.billings.push(billing);
  this.totalAmountBilled += billing.amount;
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

transportPaymentAggregateSchema.pre('save', function (next) {
  this.totalAmountPaid = this.payments.reduce((sum, p) => sum + p.amount, 0);
  this.totalAmountBilled = this.billings.reduce((sum, b) => sum + b.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  next();
});

const TransportPayment = mongoose.model('TransportPayment', transportPaymentAggregateSchema);
export default TransportPayment;
