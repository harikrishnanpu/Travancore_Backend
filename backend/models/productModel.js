// models/productModel.js
import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    name: { type: String },
    comment: { type: String },
    rating: { type: Number },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    item_id: { type: String, required: true, unique: true },
    brand: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String },
    purchaseUnit: { type: String }, // e.g., BOX, PACK
    sellingUnit: { type: String },  // e.g., PCS, KG
    psRatio: { type: Number, default: 1 },
    mrp: { type: Number, default: 0 },
    expiryDate: { type: Date },
    gst: { type: Number, default: 0 },   // e.g. 5, 12, 18
    price: { type: Number, default: 0 }, // current selling price
    countInStock: { type: Number, required: true },
    rating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],
    // Additional optional fields
    image: { type: String },
    seller: { type: String },
    sellerAddress: { type: String },
    size: { type: String },
    unit: { type: String },
    billPartPrice: { type: Number },
    type: { type: String },
  },
  { timestamps: true }
);

const Product = mongoose.model('Product', productSchema);
export default Product;
