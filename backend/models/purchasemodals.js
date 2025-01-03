// models/purchaseModel.js
import mongoose from 'mongoose';

// Item Schema for each purchased item
const itemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String },
    category: { type: String },
    purchaseUnit: { type: String, required: true }, // e.g., BOX, PACK
    sellingUnit: { type: String, required: true },  // e.g., PCS, KG
    psRatio: { type: Number, required: true },      // Pack Size Ratio
    quantity: { type: Number, required: true },
    quantityInNumbers: { type: Number, required: true }, // Calculated field
    purchasePrice: { type: Number, required: true },     // Price per unit
    gstPercent: { type: Number, required: true },        // Custom GST %
    expiryDate: { type: Date },
    mrp: { type: String }, // MRP as string or number, per your front-end
  },
  { _id: false }
);

// Totals Schema for financial calculations
const totalsSchema = new mongoose.Schema(
  {
    netItemTotal: { type: Number, required: true },    // Sum of (qty * purchasePrice)
    totalGstAmount: { type: Number, required: true },  // Sum of GST for all items
    transportCost: { type: Number, default: 0 },       // Transportation cost
    otherCost: { type: Number, default: 0 },           // Additional expense
    purchaseTotal: { type: Number, required: true },   // netItemTotal + totalGstAmount
    grandTotal: { type: Number, required: true },      // purchaseTotal + transportCost + otherCost
  },
  { _id: false }
);

// A single transport detail schema
const singleTransportSchema = new mongoose.Schema(
  {
    transportCompanyName: { type: String },
    transportGst: { type: String },
    transportationCharges: { type: Number }, // cost with GST
    billId: { type: String },
    remark: { type: String },
    billingDate: { type: Date },
    invoiceNo: { type: String },
    transportType: { type: String, default: 'general' }, // "general" or "local"
  },
  { _id: false }
);

// Main Purchase Schema
const purchaseSchema = new mongoose.Schema(
  {
    sellerId: { type: String, required: true },
    sellerName: { type: String, required: true },
    sellerAddress: { type: String },
    sellerGst: { type: String },
    invoiceNo: { type: String, required: true },
    purchaseId: { type: String, unique: true, required: true },
    billingDate: { type: Date, required: true },
    invoiceDate: { type: Date, required: true },
    items: [itemSchema], // List of purchased items
    totals: totalsSchema,
    transportationDetails: {
      type: [singleTransportSchema],
      default: [],
    },
    logicField: { type: String }, // Additional logic or notes field
  },
  { timestamps: true }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
