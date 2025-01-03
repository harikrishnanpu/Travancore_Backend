// models/SupplierAccount.js
import mongoose from 'mongoose';

const billSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  billAmount: { type: Number, required: true },
  invoiceDate: { type: Date, default: Date.now, required: true },
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now, required: true },
  method: { type: String, required: true },  // e.g. "Cash", "Bank Transfer"
  submittedBy: { type: String, required: true },
  referenceId: { type: String, required: true },
  remark: { type: String },
});

const supplierAccountSchema = new mongoose.Schema(
  {
    sellerId: { type: String, unique: true, required: true },
    sellerName: { type: String, required: true },
    sellerAddress: { type: String, required: true },
    sellerGst: { type: String, required: true },
    bills: [billSchema],
    payments: [paymentSchema],
    totalBillAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-calc totals
supplierAccountSchema.pre('save', function (next) {
  this.totalBillAmount = this.bills.reduce((sum, bill) => sum + bill.billAmount, 0);
  this.paidAmount = this.payments.reduce((sum, p) => sum + p.amount, 0);
  this.pendingAmount = this.totalBillAmount - this.paidAmount;
  next();
});

const SupplierAccount = mongoose.model('SupplierAccount', supplierAccountSchema);
export default SupplierAccount;
