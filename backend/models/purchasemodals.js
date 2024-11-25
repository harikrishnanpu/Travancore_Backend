import mongoose from "mongoose";
const purchaseSchema = mongoose.Schema(
  {
    sellerName: { type: String, required: true },
    sellerId: { type: String, required: true},
    invoiceNo: { type: String, required: true },
    items: [
      {
        itemId: { type: String, required: true },
        name: { type: String, required: true },
        brand: { type: String },
        category: { type: String },
        quantity: { type: Number, required: true },
        sUnit: { type: String },
        psRatio: { type: Number },
        length: { type: Number },
        breadth: { type: Number },
        size: { type: Number },
        pUnit: { type: String },
        cashPartPrice: { type: Number, required: true },
        billPartPrice: { type: Number, required: true },
      },
    ],
    purchaseId: { type: String, unique: true, required: true },
    sellerAddress: { type: String },
    sellerGst: { type: String },
    billingDate: { type: Date, required: true },
    invoiceDate: { type: Date, required: true },
    totals: {
      billPartTotal: { type: Number, required: true},
      cashPartTotal: { type: Number, required: true},
      amountWithoutGSTItems: { type: Number, required:true },
      gstAmountItems: { type: Number, required: true},
      cgstItems: { type: Number, required: true},
      sgstItems: { type: Number, required: true},
      amountWithoutGSTTransport: { type: Number, default: 0},
      gstAmountTransport: { type: Number, default:0},
      cgstTransport: { type: Number, default: 0},
      sgstTransport: { type: Number, default:0},
      totalPurchaseAmount: { type: Number, required: true},
      transportationCharges: { type: Number, default: 0}
    }
  },
  { timestamps: true }
);

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
