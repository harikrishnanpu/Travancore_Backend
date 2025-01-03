// models/sellerPaymentModel.js
import mongoose from 'mongoose';

const billingSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  invoiceNo: { type: String, required: true },
  purchaseId: { type: String }, // Optional to link purchase ID
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  method: { type: String, required: true }, 
  submittedBy: { type: String, required: true },
  referenceId: { type: String },
  remark: { type: String },
});

const sellerPaymentSchema = new mongoose.Schema(
  {
    sellerId: { type: String, required: true },
    sellerName: { type: String, required: true },
    billings: [billingSchema], // Past bills
    payments: [paymentSchema], // Past payments
    totalAmountBilled: { type: Number, default: 0 },
    totalAmountPaid: { type: Number, default: 0 },
    paymentRemaining: { type: Number, default: 0 },
  },
  { timestamps: true }
);

sellerPaymentSchema.pre('save', function (next) {
  this.totalAmountBilled = this.billings.reduce((sum, b) => sum + b.amount, 0);
  this.totalAmountPaid = this.payments.reduce((sum, p) => sum + p.amount, 0);
  this.paymentRemaining = this.totalAmountBilled - this.totalAmountPaid;
  next();
});

const SellerPayment = mongoose.model('SellerPayment', sellerPaymentSchema);
export default SellerPayment;
