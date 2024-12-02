// models/SupplierAccount.js
import mongoose from "mongoose";

// Sub-schema for individual bills
const billSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: true,
    trim: true,
    // Removed unique: true since MongoDB doesn't enforce uniqueness on subdocuments
  },
  billAmount: {
    type: Number,
    required: true,
    min: [0, "Bill amount cannot be negative"],
  },
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// Sub-schema for payments
const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: [0, "Payment amount cannot be negative"],
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  submittedBy: {
    type: String,
    required: true,
    trim: true,
  },
  remark: {
    type: String,
    trim: true,
  },
});

// Main SupplierAccount schema
const supplierAccountSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        // Generate a unique supplier account ID (e.g., "SUP12345ABC")
        return 'SUP' + Math.random().toString(36).slice(2, 11).toUpperCase();
      },
    },
    sellerId: {
      type: String,
      unique: true, // Ensure one SupplierAccount per seller
      required: true,
      trim: true,
    },
    sellerName: {
      type: String,
      required: true,
      trim: true,
    },
    sellerAddress: {
      type: String,
      required: true,
      trim: true,
    },
    bills: [billSchema], // Array of bills
    payments: [paymentSchema], // Array of payments
    totalBillAmount: {
      type: Number,
      default: 0,
      min: [0, "Total bill amount cannot be negative"],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },
    pendingAmount: {
      type: Number,
      default: 0,
      min: [0, "Pending amount cannot be negative"],
    },
    // Add any other necessary fields here, mirroring CustomerAccount if needed
  },
  { timestamps: true }
);

// Create an index on bills.invoiceNo for faster lookup
supplierAccountSchema.index({ "bills.invoiceNo": 1 });

// Middleware to calculate totalBillAmount, paidAmount, and pendingAmount before saving
// Also ensures invoiceNo uniqueness across all supplier accounts
supplierAccountSchema.pre('save', async function (next) {
  try {
    // === 1. Calculate Total Amounts ===
    this.totalBillAmount = this.bills.reduce((acc, bill) => acc + (bill.billAmount || 0), 0);
    this.paidAmount = this.payments.reduce((acc, payment) => acc + (payment.amount || 0), 0);
    this.pendingAmount = this.totalBillAmount - this.paidAmount;

    if (this.pendingAmount < 0) {
      return next(new Error("Paid amount exceeds total bill amount"));
    }

    // === 2. Resolve Duplicate Invoice Numbers in Current Supplier ===
    if (this.isModified('bills')) {
      const invoiceNos = this.bills.map((bill) => bill.invoiceNo);
      const uniqueInvoiceNos = new Set();
      const filteredBills = [];

      for (const bill of this.bills) {
        if (!uniqueInvoiceNos.has(bill.invoiceNo)) {
          uniqueInvoiceNos.add(bill.invoiceNo);
          filteredBills.push(bill);
        }
      }

      if (filteredBills.length !== this.bills.length) {
        console.warn("Duplicate invoice numbers found within the current supplier. Duplicates have been removed.");
      }

      this.bills = filteredBills;
    }

    // === 3. Ensure Unique Invoice Numbers Across All Suppliers ===
    if (this.isModified('bills')) {
      for (const bill of this.bills) {
        const existingSupplier = await this.constructor.findOne({
          "bills.invoiceNo": bill.invoiceNo,
          _id: { $ne: this._id }, // Exclude the current supplier account
        });

        if (existingSupplier) {
          // Option 1: Throw an error to prevent saving duplicate invoiceNo
          return next(new Error(`Invoice number "${bill.invoiceNo}" already exists for another supplier.`));

          // Option 2: Remove the duplicate bill from the existing supplier
 
          existingSupplier.bills = existingSupplier.bills.filter(
            (existingBill) => existingBill.invoiceNo !== bill.invoiceNo
          );
          await existingSupplier.save();
         
        }
      }
    }

    next();
  } catch (error) {
    next(new Error(`Error in pre-save middleware: ${error.message}`));
  }
});

// Export the SupplierAccount model
const SupplierAccount = mongoose.model('SupplierAccount', supplierAccountSchema);
export default SupplierAccount;
