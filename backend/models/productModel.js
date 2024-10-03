import mongoose from 'mongoose';
const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    comment: { type: String, required: true },
    rating: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    item_id: {type: String, required: true, unique: true},
    seller: { type: mongoose.Schema.Types.ObjectID, ref: 'User' },
    image: { type: String},
    brand: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String},
    price: { type: Number},
    countInStock: { type: Number, required: true },
    rating: { type: Number,},
    numReviews: { type: Number,},
    reviews: [reviewSchema],
  },
  {
    timestamps: true,
  }
);
const Product = mongoose.model('Product', productSchema);

export default Product;
