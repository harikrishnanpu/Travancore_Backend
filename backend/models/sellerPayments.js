import mongoose from 'mongoose';

const purchasepaymentSchema = mongoose.Schema({
  amount: { type: Number, required: true },
  method: { type: String, required: true }, // e.g., "credit card", "cash", etc.
  submittedBy: { type: String, required: true },
  date: { type: Date, default: Date.now },
  remark: { type: String },
});

const purchasebillingSchema = mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  purchaseId: { type: String, required: true, unique: true },
  invoiceNo: { type: String, required: true },
}); 

const sellerpurchasePaymentSchema = mongoose.Schema(
  {
    sellerId: { type: String, required: true },
    sellerName: { type: String, required: true },
    payments: [purchasepaymentSchema], // Array of payments
    billings: [purchasebillingSchema], // Array of billings
    totalAmountBilled: { type: Number, default: 0 }, // Total amount from billings
    totalAmountPaid: { type: Number, default: 0 }, // Total amount from payments
    paymentRemaining: { type: Number, default: 0 }, // Auto-calculated field
  },
  { timestamps: true }
);

// Pre-save middleware to auto-calculate paymentRemaining
sellerpurchasePaymentSchema.pre('save', function (next) {
  this.totalAmountPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.totalAmountBilled = this.billings.reduce((sum, billing) => sum + billing.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  next();
});

// Add a method to add a payment and recalculate amounts
sellerpurchasePaymentSchema.methods.addPayment = function (payment) {
  this.payments.push(payment);
  this.totalAmountPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

// Add a method to add a billing and recalculate amounts
sellerpurchasePaymentSchema.methods.addBilling = function (billing) {
  this.billings.push(billing);
  this.totalAmountBilled = this.billings.reduce((sum, billing) => sum + billing.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  return this.save();
};

const SellerPayment = mongoose.model('SellerPayment', sellerpurchasePaymentSchema);

export default SellerPayment;
