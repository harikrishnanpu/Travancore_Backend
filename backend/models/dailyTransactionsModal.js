import mongoose from "mongoose";

const DailyTransactionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    type: { type: String, required: true }, // 'in' or 'out'
    amount: { type: Number, required: true },
    paymentFrom: { type: String }, // For 'in' transactions
    paymentTo: { type: String }, // For 'out' transactions
    category: { type: String, required: true },
    method: { type: String, required: true }, // Payment method
    remark: { type: String },
    billId: { type: String }, // If linked to a billing
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const TransactionCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
});

const DailyTransaction = mongoose.model('DailyTransaction', DailyTransactionSchema);
const TransactionCategory = mongoose.model('TransactionCategory', TransactionCategorySchema);

export { DailyTransaction, TransactionCategory };
