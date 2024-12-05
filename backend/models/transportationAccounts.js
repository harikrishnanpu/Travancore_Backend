// models/transportationAccount.js
import mongoose from 'mongoose';

const billSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  billAmount: { type: Number, required: true },
  invoiceDate: { type: Date, required: true, default: Date.now },
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, required: true, default: Date.now },
  method: { type: String, required: true }, // accountId from PaymentsAccount
  submittedBy: { type: String, required: true },
  remark: { type: String },
});

const transportationAccountSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    transportType: { type: String, required: true },
    bills: [billSchema], // Array of bills
    payments: [paymentSchema], // Array of payments
    totalBillAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Middleware to calculate totalBillAmount, paidAmount, and pendingAmount before saving
transportationAccountSchema.pre('save', function (next) {
  this.totalBillAmount = this.bills.reduce((sum, bill) => sum + bill.billAmount, 0);
  this.paidAmount = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.pendingAmount = this.totalBillAmount - this.paidAmount;
  next();
});

const TransportationAccount = mongoose.model('TransportationSchema', transportationAccountSchema);
export default TransportationAccount;
