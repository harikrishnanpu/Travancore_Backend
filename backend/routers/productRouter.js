import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import data from '../data.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import { isAdmin, isAuth } from '../utils.js';
import asyncHandler from 'express-async-handler';
import Purchase from '../models/purchasemodals.js';
import SellerPayment from '../models/sellerPayments.js';
import TransportPayment from '../models/transportPayments.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Transportation from '../models/transportModal.js';
import Billing from '../models/billingModal.js';
import Return from '../models/returnModal.js';
import Damage from '../models/damageModal.js';
import StockOpening from '../models/stockOpeningModal.js';


const productRouter = express.Router();

productRouter.get('/',
  expressAsyncHandler(async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;
    const name = req.query.name ? req.query.name.toUpperCase() : '';
    const category = req.query.category ? req.query.category.toUpperCase() : '';
    const brand = req.query.brand ? req.query.brand.toUpperCase() : '';
    const size = req.query.size ? req.query.size.toUpperCase() : '';
    const order = req.query.order ? req.query.order.toLowerCase() : '';
    const min = req.query.min && Number(req.query.min) !== 0 ? Number(req.query.min) : 0;
    const max = req.query.max && Number(req.query.max) !== 0 ? Number(req.query.max) : 0;
    const rating = req.query.rating && Number(req.query.rating) !== 0 ? Number(req.query.rating) : 0;
    const inStock = req.query.inStock;
    const countInStockMin = req.query.countInStockMin
      ? Number(req.query.countInStockMin)
      : 0;

    const nameFilter = name && name !== 'ALL' ? { name: { $regex: name, $options: 'i' } } : {};
    const categoryFilter = category && category !== 'ALL' ? { category } : {};
    const brandFilter = brand && brand !== 'ALL' ? { brand } : {};
    const sizeFilter = size && size !== 'ALL' ? { size } : {};
    const priceFilter =
      min !== 0 || max !== 0
        ? { price: { ...(min !== 0 ? { $gte: min } : {}), ...(max !== 0 ? { $lte: max } : {}) } }
        : {};
    const ratingFilter = rating ? { rating: { $gte: rating } } : {};
    const inStockFilter =
      inStock === 'true'
        ? { countInStock: { $gt: 0 } }
        : {};
    const countInStockMinFilter =
      countInStockMin > 0 ? { countInStock: { $gte: countInStockMin } } : {};

    const sortOrder =
      order === 'lowest'
        ? { price: 1 }
        : order === 'highest'
        ? { price: -1 }
        : order === 'toprated'
        ? { rating: -1 }
        : order === 'countinstock'
        ? { countInStock: -1 }
        : { _id: -1 };

    try {
      const totalProducts = await Product.countDocuments({
        ...nameFilter,
        ...categoryFilter,
        ...brandFilter,
        ...sizeFilter,
        ...priceFilter,
        ...ratingFilter,
        ...inStockFilter,
        ...countInStockMinFilter,
      });

      const products = await Product.find({
        ...nameFilter,
        ...categoryFilter,
        ...brandFilter,
        ...sizeFilter,
        ...priceFilter,
        ...ratingFilter,
        ...inStockFilter,
        ...countInStockMinFilter,
      })
        .sort(sortOrder)
        .skip(pageSize * (page - 1))
        .limit(pageSize);

      res.send({
        products,
        page,
        totalProducts,
        pages: Math.ceil(totalProducts / pageSize),
      });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  })
);

// Additional routes to get categories, brands, and sizes
productRouter.get(
  '/categories',
  expressAsyncHandler(async (req, res) => {
    const categories = await Product.find().distinct('category');
    res.send(categories);
  })
);

productRouter.get(
  '/brands',
  expressAsyncHandler(async (req, res) => {
    const brands = await Product.find().distinct('brand');
    res.send(brands);
  })
);

productRouter.get(
  '/sizes',
  expressAsyncHandler(async (req, res) => {
    const sizes = await Product.find().distinct('size');
    res.send(sizes);
  })
);


productRouter.get('/searchform/search', async (req, res) => {
  let searchQuery = (req.query.q || '').trim();
  const limit = parseFloat(req.query.limit) || 8;

  try {
    let products = [];

    // Check if the search query matches the pattern for an item ID (starts with 'K' followed by numbers)
    const isItemId = /^K\d+$/i.test(searchQuery);

    if (isItemId) {
      // Search for the product by item ID (exact match)
      const product = await Product.findOne({ item_id: searchQuery.toUpperCase() });
      if (product) {
        products.push(product);
      } else {
        return res.status(404).json({ message: 'No product found with the specified item ID' });
      }
    } else {
      // Split the search query into words and create a regex pattern for each
      const searchTerms = searchQuery.split(/\s+/).map(term => new RegExp(term, 'i'));

      // Find products where all search terms match in the `name` field
      products = await Product.find({
        $and: searchTerms.map(term => ({ name: { $regex: term } }))
      }).limit(limit);

      if (products.length === 0) {
        return res.status(404).json({ message: 'No products match your search query' });
      }
    }

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});



// Route to get product by item ID
productRouter.get('/itemId/:itemId', async (req, res) => {
  try {
    const itemId = req.params.itemId.toUpperCase();

    // Search for the product by item_id (case-insensitive)
    let product = await Product.findOne({ item_id: itemId });

    // If no product is found with item_id, search by name
    if (!product) {
      product = await Product.findOne({ name: { $regex: itemId, $options: 'i' } });
    }

    // If still no product is found, return a 404 error
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Return the found product
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});


productRouter.get('/search/itemId', async (req, res) => {
  try {
    const query = req.query.query.toUpperCase();
    // Regex to match item IDs starting with 'K' followed by 1 to 4 digits
    const isItemId = /^TC\d{1,4}$/.test(query);

    let products;
    
    if (isItemId) {
      // If the query is an item ID, find the specific product
      products = await Product.find({ item_id: query }).limit(1);
    } else {
      // If the query is a name, perform a regex search
      const regex = new RegExp(query, 'i');  // Case-insensitive regex search
      products = await Product.find({ 
        $or: [
          { name: regex } 
        ] 
      }).limit(8); // Limit the number of suggestions
    }

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error });
  }
});


productRouter.get('/admin/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(
      categories.map((category) => ({
        name: category._id,
        count: category.count,
      }))
    );
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ message: 'Error fetching product categories' });
  }
});








productRouter.get(
  '/seed',
  expressAsyncHandler(async (req, res) => {
    // await Product.remove({});
    const seller = await User.findOne({ isSeller: true });
    if (seller) {
      const products = data.products.map((product) => ({
        ...product,
        seller: seller._id,
      }));
      const createdProducts = await Product.insertMany(products);
      res.send({ createdProducts });
    } else {
      res
        .status(500)
        .send({ message: 'No seller found. first run /api/users/seed' });
    }
  })
);

productRouter.get(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate(
      'seller',
      'seller.name seller.logo seller.rating seller.numReviews'
    );
    if (product) {
      res.send(product);
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);

productRouter.post(
  '/',
  expressAsyncHandler(async (req, res) => {

    try{
    const product = new Product({
      name: 'Sample name ' + Date.now().toString(),
      item_id: Date.now(),
      seller: 'Supplier',
      image: '/images/',
      price: 0,
      category: 'Category',
      brand: 'Brand',
      countInStock: 0,
      psRatio: 0,
      pUnit: 'BOX',
      sUnit: 'NOS',
      length: 0,
      breadth: 0,
      size: 'size',
      unit: 'unit',
      rating: 0,
      numReviews: 0,
      description: 'Sample description',
    });
    const createdProduct = await product.save();
    res.status(201).send(createdProduct);

  }catch (error){
    console.log("error creating product", error)
    res.status(500).json({ message: 'Error creating product' });
  }
  })
);


// Update a product
productRouter.put('/get-item/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error updating product' });
  }
});

productRouter.put('/update-stock/:id', async (req, res) => {
  const { countInStock, userName } = req.body; // Extract countInStock from the request body

  try {
    // Check if countInStock is a valid number (float or integer)
    if (typeof countInStock !== 'number' || isNaN(countInStock)) {
      return res.status(400).json({ message: 'Invalid countInStock value' });
    }

    // Use $inc to add the countInStock value (can be a float)
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { countInStock } },
      { new: true }
    );

    // Check if the product was found
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }


      // Create log entry
  const logEntry = new StockOpening({
    item_id: product.item_id,
    name: product.name,
    quantity: countInStock,
    submittedBy: userName,
    remark: 'Bill Opening',
    date: new Date(),
  });

  await logEntry.save();

    res.json(product);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Error updating product stock' });
  }
});


productRouter.put(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (product) {
      product.name = req.body.name;
      product.price = req.body.price;
      product.image = req.body.image;
      product.category = req.body.category;
      product.brand = req.body.brand;
      product.countInStock = req.body.countInStock;
      product.description = req.body.description;
      product.item_id = req.body.itemId;
      product.psRatio = req.body.psRatio;
      product.purchaseUnit = req.body.pUnit;
      product.sellingUnit = req.body.sUnit;
      product.mrp = req.body.mrp;
      product.expiryDate = req.body.expiryDate;
      product.size = req.body.size;
      product.unit = req.body.unit;
      product.type = req.body.type;
      product.cashPartPrice = req.body.cashPartPrice;
      product.billPartPrice = req.body.billPartPrice;
      const updatedProduct = await product.save();
      res.send({ message: 'Product Updated', product: updatedProduct });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);

productRouter.delete(
  '/:id',
  expressAsyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (product) {
      await Product.deleteOne({ _id: req.params.id }); // Delete the product using `deleteOne`
      res.send({ message: 'Product Deleted', product });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);


productRouter.post(
  '/:id/reviews',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    if (product) {
      if (product.reviews.find((x) => x.name === req.body.name)) {
        return res
          .status(400)
          .send({ message: 'You already submitted a review' });
      }
      const review = {
        name: req.body.name,
        rating: Number(req.body.rating),
        comment: req.body.comment,
      };
      product.reviews.push(review);
      product.numReviews = product.reviews.length;
      product.rating =
        product.reviews.reduce((a, c) => c.rating + a, 0) /
        product.reviews.length;
      const updatedProduct = await product.save();
      res.status(201).send({
        message: 'Review Created',
        review: updatedProduct.reviews[updatedProduct.reviews.length - 1],
      });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);


productRouter.post(
  '/purchase',
  asyncHandler(async (req, res) => {
    try {
      const {
        sellerId,
        sellerName,
        sellerAddress,
        sellerGst,
        invoiceNo,
        purchaseId: clientPurchaseId, // User might send a proposed purchaseId
        billingDate,
        invoiceDate,
        items,
        totals,
        transportationDetails,
        logicField,
      } = req.body;

      // 1. Check if a Purchase with the same invoiceNo or purchaseId already exists
      let existingPurchase = await Purchase.findOne({
        $or: [{ invoiceNo }, { purchaseId: clientPurchaseId }],
      });

      // If the purchase ID is missing or already exists, generate a new one
      let purchaseId = clientPurchaseId;
      if (existingPurchase || !purchaseId) {
        const latestPurchase = await Purchase.findOne({ purchaseId: /^TC\d+$/ })
          .sort({ purchaseId: -1 })
          .collation({ locale: 'en', numericOrdering: true }); // Ensures TC10 > TC2

        if (!latestPurchase) {
          purchaseId = 'TC1';
        } else {
          const latestNumber = parseInt(
            latestPurchase.purchaseId.replace('TC', ''),
            10
          );
          purchaseId = `TC${latestNumber + 1}`;
        }
      }

      // 2. Update or create Product documents, adjusting countInStock
      for (const item of items) {
        const quantityInNumbers = parseFloat(item.quantityInNumbers || 0);
        let product = await Product.findOne({ item_id: item.itemId });

        if (product) {
          // Increase existing stock
          product.countInStock += quantityInNumbers;

          // Update product fields (optional)
          product.name = item.name;
          product.brand = item.brand;
          product.category = item.category;
          product.purchaseUnit = item.purchaseUnit;
          product.sellingUnit = item.sellingUnit;
          product.psRatio = item.psRatio;
          product.gst = item.gst;
          product.expiryDate = new Date(item.expiryDate);
          product.price = parseFloat(item.mrp) || product.price; // e.g. base price on MRP
          await product.save();
        } else {
          // Create new product
          const newProduct = new Product({
            item_id: item.itemId,
            name: item.name,
            gst: item.gst,
            brand: item.brand,
            category: item.category,
            purchaseUnit: item.purchaseUnit,
            sellingUnit: item.sellingUnit,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            psRatio: item.psRatio,
            mrp: parseFloat(item.mrp) || 0,
            price: parseFloat(item.mrp) || 0, // Assume price = MRP initially
            countInStock: quantityInNumbers,
          });
          await newProduct.save();
        }
      }

      // 3. Create the Purchase document
      const purchase = new Purchase({
        sellerId,
        sellerName,
        sellerAddress,
        sellerGst,
        invoiceNo,
        purchaseId,
        billingDate,
        invoiceDate,
        items: items.map((i) => ({ ...i })), // store item snapshot
        totals,
        logicField,
      });

      // 4. If transportationDetails is provided, transform it into an array
      if (
        transportationDetails &&
        typeof transportationDetails === 'object'
      ) {
        const transportArray = [];

        // "general" transport
        if (
          transportationDetails.general &&
          transportationDetails.general.transportCompanyName
        ) {
          const g = transportationDetails.general;
          transportArray.push({
            transportCompanyName: g.transportCompanyName || '',
            transportGst: g.transportGst,
            transportationCharges: parseFloat(g.transportationCharges) || 0,
            billId: g.billId,
            remark: g.remark,
            billingDate: g.billingDate ? new Date(g.billingDate) : new Date(),
            invoiceNo: g.invoiceNo || invoiceNo,
            transportType: 'general',
          });
        }

        // "local" transport (if applicable)
        if (
          transportationDetails.local &&
          transportationDetails.local.transportCompanyName
        ) {
          const l = transportationDetails.local;
          transportArray.push({
            transportCompanyName: l.transportCompanyName || '',
            transportGst: l.transportGst,
            transportationCharges: parseFloat(l.transportationCharges) || 0,
            billId: l.billId,
            remark: l.remark,
            billingDate: l.billingDate ? new Date(l.billingDate) : new Date(),
            invoiceNo: l.invoiceNo || invoiceNo,
            transportType: 'local',
          });
        }

        purchase.transportationDetails = transportArray;
      }

      await purchase.save();

      // 5. Create Transportation docs & TransportPayment entries if present
      if (
        transportationDetails &&
        typeof transportationDetails === 'object'
      ) {
        for (const [type, transport] of Object.entries(transportationDetails)) {
          if (!transport || !transport.transportCompanyName) continue;

          // Create Transportation doc
          const transportDoc = new Transportation({
            purchaseId,
            invoiceNo: transport.invoiceNo || invoiceNo,
            transportType: type, // 'general' or 'local'
            companyGst: transport.transportGst,
            billId: transport.billId,
            transportCompanyName: transport.transportCompanyName || '',
            transportationCharges: parseFloat(transport.transportationCharges) || 0,
            remarks: transport.remark,
            billingDate: transport.billingDate
              ? new Date(transport.billingDate)
              : new Date(),
          });
          await transportDoc.save();

          // Create or update TransportPayment
          const billingEntry = {
            amount: parseFloat(transport.transportationCharges) || 0,
            date: transport.billingDate ? new Date(transport.billingDate) : new Date(),
            billId: transport.billId,
            invoiceNo: transport.invoiceNo || invoiceNo,
          };

          let transportPayment = await TransportPayment.findOne({
            transportName: transport.transportCompanyName,
            transportType: type,
          });

          if (transportPayment) {
            transportPayment.billings.push(billingEntry);
          } else {
            transportPayment = new TransportPayment({
              transportName: transport.transportCompanyName,
              transportType: type,
              transportGst: transport.transportGst,
              billings: [billingEntry],
              payments: [],
            });
          }
          await transportPayment.save();
        }
      }

      // 6. Update or create SellerPayment
      let sellerPayment = await SellerPayment.findOne({ sellerId });
      const purchaseTotal = totals?.purchaseTotal || 0;
      const billingEntry = {
        amount: purchaseTotal,
        date: billingDate ? new Date(billingDate) : new Date(),
        purchaseId,
        invoiceNo,
      };

      if (sellerPayment) {
        sellerPayment.billings.push(billingEntry);
      } else {
        sellerPayment = new SellerPayment({
          sellerId,
          sellerName,
          billings: [billingEntry],
          payments: [],
        });
      }
      await sellerPayment.save();

      // 7. Update or create SupplierAccount
      let supplierAccount = await SupplierAccount.findOne({ sellerId });
      const accountBill = {
        invoiceNo,
        billAmount: purchaseTotal,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
      };

      if (supplierAccount) {
        supplierAccount.bills.push(accountBill);
      } else {
        supplierAccount = new SupplierAccount({
          sellerId,
          sellerName,
          sellerAddress: sellerAddress || '',
          sellerGst: sellerGst || '',
          bills: [accountBill],
          payments: [],
        });
      }
      await supplierAccount.save();

      // 8. Return final purchaseId
      res.status(201).json(purchaseId);
    } catch (error) {
      console.error('Error creating purchase:', error);
      res
        .status(500)
        .json({ message: 'Error creating purchase', error: error.message });
    }
  })
);

/**
 * UPDATE PURCHASE
 * PUT /api/products/purchase/:purchaseId
 * 
 * NOTE: In this code, we're assuming :purchaseId is the MongoDB _id, 
 *       which we find via { _id: purchaseId }. 
 *       If your route is different, adjust accordingly.
 */
productRouter.put(
  '/purchase/:id',
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params; // This is the Mongo _id of the Purchase
      const {
        purchaseId,
        sellerId,
        sellerName,
        sellerAddress,
        sellerGst,
        invoiceNo,
        billingDate,
        invoiceDate,
        items,
        totals,
        transportationDetails,
        logicField,
      } = req.body;

      // 1. Find existing purchase by its _id
      const existingPurchase = await Purchase.findOne({ _id: id });
      if (!existingPurchase) {
        console.log(`Purchase with ID ${purchaseId} not found.`);
        return res.status(404).json({ message: 'Purchase not found' });
      }

      // 2. Store old references
      const oldSellerId = existingPurchase.sellerId;
      const oldInvoiceNo = existingPurchase.invoiceNo;

      // 3. Revert product stock from old items
      for (const oldItem of existingPurchase.items) {
        const oldQty = parseFloat(oldItem.quantityInNumbers) || 0;
        const product = await Product.findOne({ item_id: oldItem.itemId });
        if (product) {
          product.countInStock -= oldQty;
          if (product.countInStock < 0) {
            product.countInStock = 0; // Avoid negative
          }
          await product.save();
        }
      }

      // 4. Add stock for new items & optionally update product fields
      for (const newItem of items) {
        const newQty = parseFloat(newItem.quantityInNumbers) || 0;
        let product = await Product.findOne({ item_id: newItem.itemId });

        if (product) {
          product.countInStock += newQty;
          // Update fields (optional)
          product.name = newItem.name;
          product.brand = newItem.brand;
          product.category = newItem.category;
          product.purchaseUnit = newItem.purchaseUnit;
          product.sellingUnit = newItem.sellingUnit;
          product.psRatio = newItem.psRatio;
          product.gst = newItem.gst;
          product.expiryDate = newItem.expiryDate ? new Date(newItem.expiryDate): product.expiryDate;
          product.price = parseFloat(newItem.mrp) || product.price;
          await product.save();
        } else {
          // Create new product
          product = new Product({
            item_id: newItem.itemId,
            name: newItem.name,
            brand: newItem.brand,
            gst: newItem.gst,
            category: newItem.category,
            purchaseUnit: newItem.purchaseUnit,
            sellingUnit: newItem.sellingUnit,
            psRatio: newItem.psRatio,
            mrp: parseFloat(newItem.mrp) || 0,
            price: parseFloat(newItem.mrp) || 0,
            countInStock: newQty,
            expiryDate: newItem.expiryDate ? new Date(newItem.expiryDate) : null,
          });
          await product.save();
        }
      }

      // 5. Update the existing Purchase document fields
      existingPurchase.sellerId = sellerId;
      existingPurchase.sellerName = sellerName;
      existingPurchase.sellerAddress = sellerAddress;
      existingPurchase.sellerGst = sellerGst;
      existingPurchase.invoiceNo = invoiceNo;
      existingPurchase.billingDate = billingDate
        ? new Date(billingDate)
        : existingPurchase.billingDate;
      existingPurchase.invoiceDate = invoiceDate
        ? new Date(invoiceDate)
        : existingPurchase.invoiceDate;
      existingPurchase.items = items.map((i) => ({ ...i }));
      existingPurchase.totals = totals;
      existingPurchase.logicField = logicField || existingPurchase.logicField;

      // 6. Update SupplierAccount
      const purchaseTotal = totals?.purchaseTotal || 0;
      if (oldSellerId !== sellerId) {
        // The seller changed => remove old seller's bill, add to new
        const oldSupplierAccount = await SupplierAccount.findOne({
          sellerId: oldSellerId,
        });
        if (oldSupplierAccount) {
          oldSupplierAccount.bills = oldSupplierAccount.bills.filter(
            (b) => b.invoiceNo !== oldInvoiceNo
          );
          await oldSupplierAccount.save();
        }

        let newSupplierAccount = await SupplierAccount.findOne({ sellerId });
        const newBill = {
          invoiceNo,
          billAmount: purchaseTotal,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        };
        if (newSupplierAccount) {
          newSupplierAccount.bills.push(newBill);
        } else {
          newSupplierAccount = new SupplierAccount({
            sellerId,
            sellerName,
            sellerAddress: sellerAddress || '',
            sellerGst: sellerGst || '',
            bills: [newBill],
            payments: [],
          });
        }
        await newSupplierAccount.save();
      } else {
        // Same seller => update or add the correct bill
        const sameSupplier = await SupplierAccount.findOne({ sellerId });
        if (sameSupplier) {
          const idx = sameSupplier.bills.findIndex(
            (b) => b.invoiceNo === oldInvoiceNo
          );
          if (idx !== -1) {
            sameSupplier.bills[idx].invoiceNo = invoiceNo;
            sameSupplier.bills[idx].billAmount = purchaseTotal;
            sameSupplier.bills[idx].invoiceDate = invoiceDate
              ? new Date(invoiceDate)
              : sameSupplier.bills[idx].invoiceDate;
          } else {
            sameSupplier.bills.push({
              invoiceNo,
              billAmount: purchaseTotal,
              invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            });
          }
          await sameSupplier.save();
        } else {
          // No SupplierAccount => create fresh
          const freshSupplier = new SupplierAccount({
            sellerId,
            sellerName,
            sellerAddress: sellerAddress || '',
            sellerGst: sellerGst || '',
            bills: [
              {
                invoiceNo,
                billAmount: purchaseTotal,
                invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
              },
            ],
            payments: [],
          });
          await freshSupplier.save();
        }
      }

      // 7. Update SellerPayment
      if (oldSellerId !== sellerId) {
        // Remove billing from old seller
        const oldSP = await SellerPayment.findOne({ sellerId: oldSellerId });
        if (oldSP) {
          oldSP.billings = oldSP.billings.filter(
            (b) => b.invoiceNo !== oldInvoiceNo
          );
          await oldSP.save();
        }

        // Add billing to new seller
        let newSP = await SellerPayment.findOne({ sellerId });
        const billingEntry = {
          amount: purchaseTotal,
          date: billingDate ? new Date(billingDate) : new Date(),
          invoiceNo,
          purchaseId,
        };
        if (newSP) {
          newSP.billings.push(billingEntry);
        } else {
          newSP = new SellerPayment({
            sellerId,
            sellerName,
            billings: [billingEntry],
            payments: [],
          });
        }
        await newSP.save();
      } else {
        // Same seller => update or add
        const sameSP = await SellerPayment.findOne({ sellerId });
        if (sameSP) {
          const bIndex = sameSP.billings.findIndex(
            (b) => b.invoiceNo === oldInvoiceNo
          );
          if (bIndex !== -1) {
            sameSP.billings[bIndex].invoiceNo = invoiceNo;
            sameSP.billings[bIndex].amount = purchaseTotal;
            sameSP.billings[bIndex].date = billingDate
              ? new Date(billingDate)
              : sameSP.billings[bIndex].date;
            sameSP.billings[bIndex].purchaseId = purchaseId;
          } else {
            sameSP.billings.push({
              amount: purchaseTotal,
              date: billingDate ? new Date(billingDate) : new Date(),
              invoiceNo,
              purchaseId,
            });
          }
          await sameSP.save();
        } else {
          // Create new SellerPayment
          const freshSP = new SellerPayment({
            sellerId,
            sellerName,
            billings: [
              {
                amount: purchaseTotal,
                date: billingDate ? new Date(billingDate) : new Date(),
                invoiceNo,
                purchaseId,
              },
            ],
            payments: [],
          });
          await freshSP.save();
        }
      }

      // 8. Remove old transport details from DB (Transportation + TransportPayment)
      if (
        existingPurchase.transportationDetails &&
        existingPurchase.transportationDetails.length
      ) {
        for (const oldT of existingPurchase.transportationDetails) {
          // Remove from Transportation docs
          await Transportation.deleteOne({
            purchaseId,
            transportType: oldT.transportType,
          });

          // Remove from TransportPayment
          const oldTP = await TransportPayment.findOne({
            transportName: oldT.transportCompanyName,
            transportType: oldT.transportType,
          });
          if (oldTP) {
            oldTP.billings = oldTP.billings.filter(
              (b) => b.billId !== oldT.billId
            );
            // Recompute amounts
            oldTP.totalAmountBilled = oldTP.billings.reduce(
              (sum, b) => sum + b.amount,
              0
            );
            oldTP.paymentRemaining =
              oldTP.totalAmountBilled - oldTP.totalAmountPaid;
            await oldTP.save();
          }
        }
      }

      // 9. Add new transport details if provided
      const newTransportArray = [];
      if (transportationDetails && typeof transportationDetails === 'object') {
        for (const [type, transport] of Object.entries(transportationDetails)) {
          if (!transport || !transport.transportCompanyName) continue;

          // Create Transportation document
          const transportDoc = new Transportation({
            purchaseId,
            invoiceNo: transport.invoiceNo || invoiceNo,
            transportType: type, // e.g. 'general' or 'local'
            companyGst: transport.transportGst,
            billId: transport.billId,
            transportCompanyName: transport.transportCompanyName || '',
            transportationCharges: parseFloat(transport.transportationCharges) || 0,
            remarks: transport.remark,
            billingDate: transport.billingDate
              ? new Date(transport.billingDate)
              : new Date(),
          });
          await transportDoc.save();

          // Create or update TransportPayment
          const billingEntry = {
            amount: parseFloat(transport.transportationCharges) || 0,
            date: transport.billingDate ? new Date(transport.billingDate) : new Date(),
            billId: transport.billId,
            invoiceNo: transport.invoiceNo || invoiceNo,
          };

          let transportPayment = await TransportPayment.findOne({
            transportName: transport.transportCompanyName,
            transportType: type,
          });

          if (transportPayment) {
            transportPayment.billings.push(billingEntry);
          } else {
            transportPayment = new TransportPayment({
              transportName: transport.transportCompanyName,
              transportType: type,
              transportGst: transport.transportGst,
              billings: [billingEntry],
              payments: [],
            });
          }
          await transportPayment.save();

          newTransportArray.push({
            transportCompanyName: transport.transportCompanyName,
            transportGst: transport.transportGst,
            transportationCharges: parseFloat(transport.transportationCharges) || 0,
            billId: transport.billId,
            remark: transport.remark,
            billingDate: transport.billingDate
              ? new Date(transport.billingDate)
              : new Date(),
            invoiceNo: transport.invoiceNo || invoiceNo,
            transportType: type,
          });
        }
      }

      // Assign new transport array to Purchase doc
      existingPurchase.transportationDetails = newTransportArray;
      await existingPurchase.save();

      return res.json({ message: 'Purchase updated successfully' });
    } catch (error) {
      console.error('Error updating purchase:', error);
      res
        .status(500)
        .json({ message: 'Error updating purchase', error: error.message });
    }
  })
);

/**
 * DELETE PURCHASE
 * DELETE /api/products/purchases/delete/:id
 */
productRouter.delete(
  '/purchases/delete/:id',
  asyncHandler(async (req, res) => {
    try {
      const purchase = await Purchase.findById(req.params.id);
      if (!purchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }

      // 1) Revert product stock
      for (const item of purchase.items) {
        const product = await Product.findOne({ item_id: item.itemId });
        if (product) {
          product.countInStock -= parseFloat(item.quantityInNumbers || 0);
          if (product.countInStock < 0) {
            product.countInStock = 0;
          }
          await product.save();
        }
      }

      const sellerId = purchase.sellerId;
      const invoiceNo = purchase.invoiceNo;
      const purchaseId = purchase.purchaseId;

      // 2) Remove corresponding bill from SupplierAccount
      const supplierAccount = await SupplierAccount.findOne({ sellerId });
      if (supplierAccount) {
        supplierAccount.bills = supplierAccount.bills.filter(
          (bill) => bill.invoiceNo !== invoiceNo
        );
        // Optionally recalc totals
        supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
          (sum, bill) => sum + bill.billAmount,
          0
        );
        supplierAccount.pendingAmount =
          supplierAccount.totalBillAmount - supplierAccount.paidAmount;
        await supplierAccount.save();
      }

      // 3) Remove billing from SellerPayment
      const sellerPayment = await SellerPayment.findOne({ sellerId });
      if (sellerPayment) {
        sellerPayment.billings = sellerPayment.billings.filter(
          (b) => b.invoiceNo !== invoiceNo
        );
        // Recompute
        sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
          (sum, b) => sum + b.amount,
          0
        );
        sellerPayment.paymentRemaining =
          sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
        await sellerPayment.save();
      }

      // 4) Remove transportation billing entries from TransportPayment,
      //    and delete Transportation docs
      if (
        purchase.transportationDetails &&
        purchase.transportationDetails.length > 0
      ) {
        for (const t of purchase.transportationDetails) {
          // Remove from TransportPayment
          const transportPayment = await TransportPayment.findOne({
            transportName: t.transportCompanyName,
            transportType: t.transportType,
          });
          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== t.billId
            );
            // Recompute amounts
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled -
              transportPayment.totalAmountPaid;
            await transportPayment.save();
          }

          // Remove the Transportation document
          await Transportation.deleteOne({
            purchaseId,
            transportType: t.transportType,
          });
        }
      }

      // 5) Finally, remove the purchase doc
      await Purchase.deleteOne({ _id: req.params.id });

      res.json({ message: 'Purchase deleted successfully' });
    } catch (error) {
      console.error('Error deleting purchase:', error);
      res
        .status(500)
        .json({ message: 'Error deleting purchase', error: error.message });
    }
  })
);







productRouter.get('/purchases/all',async (req,res) => {
  const allpurchases = await Purchase.find().sort({ createdAt: -1});
  if(allpurchases){
    res.status(200).json(allpurchases)
  }else{
    console.log("no bills")
    res.status(500).json({message: "No Purchase Bills Available"})
  }
});


// Route to fetch all low-stock products
productRouter.get('/all-items/low-stock', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } }).sort({ countInStock: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});

// Route to fetch a limited number of low-stock products (e.g., for homepage)
productRouter.get('/items/low-stock-limited', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } })
      .sort({ countInStock: 1 })
      // .limit(3); // Limit to 3 products

    const outOfStockProducts = products.filter(product => product.countInStock == 0);
    const lowStockProducts = products.filter(product => product.countInStock > 0);

    // Combine them for the limited response
    const sortedLimitedProducts = [...outOfStockProducts, ...lowStockProducts].slice(0, 1); // Limit to 3
    res.json(sortedLimitedProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


productRouter.get('/low-stock/all', async (req, res) => {
  try {
    const products = await Product.find({ countInStock: { $lt: 10 } })
      .sort({ countInStock: 1 })
      // .limit(3); // Limit to 3 products

    const outOfStockProducts = products.filter(product => product.countInStock == 0);
    const lowStockProducts = products.filter(product => product.countInStock > -100);

    // Combine them for the limited response
    const sortedLimitedProducts = [...outOfStockProducts, ...lowStockProducts] // Limit to 3
    res.json(sortedLimitedProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


productRouter.get('/lastadded/id', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const item = await Product.findOne({ item_id: /^TC\d+$/ })
      .sort({ item_id: -1 })
      .collation({ locale: "en", numericOrdering: true });

    // Check if an invoice was found
    if (item) {
      res.json(item.item_id);
    } else {
      const newitem = await Product.find()
      .sort({ item_id: -1 })
      .collation({ locale: "en", numericOrdering: true });
      res.json(newitem.item_id);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});




productRouter.get(
  '/stock/stock-logs',
  asyncHandler(async (req, res) => {
    try {
      // Fetch all related data in parallel
      const [billings, purchases, returns, damages, openings, products] = await Promise.all([
        Billing.find({ isApproved: true }).lean(),
        Purchase.find().lean(),
        Return.find().lean(),
        Damage.find().lean(),
        StockOpening.find().lean(),
        Product.find().lean(),
      ]);

      // Create a quick-lookup map for product details
      const productMap = {};
      for (const p of products) {
        productMap[p.item_id] = p;
      }

      // Each log entry structure:
      // {
      //   date: Date,
      //   itemId: String,
      //   name: String,
      //   brand: String,
      //   category: String,
      //   changeType: "Sales (Billing)" | "Purchase" | "Return" | "Damage" | "Opening Stock",
      //   invoiceNo: String or null,
      //   quantityChange: Number,
      //   finalStock: Number (current countInStock)
      // }

      // Billing (Sales) Logs: products sold reduce stock
      const billingLogs = billings.flatMap((b) =>
        b.products.map((prod) => {
          const pInfo = productMap[prod.item_id] || {};
          return {
            date: b.createdAt,
            itemId: prod.item_id,
            name: pInfo.name || prod.name,
            brand: pInfo.brand || prod.brand,
            category: pInfo.category || prod.category,
            changeType: 'Sales (Billing)',
            invoiceNo: b.invoiceNo,
            quantityChange: -Math.abs(prod.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Purchase Logs: purchased items increase stock
      const purchaseLogs = purchases.flatMap((pur) =>
        pur.items.map((item) => {
          const pInfo = productMap[item.itemId] || {};
          return {
            date: pur.createdAt,
            itemId: item.itemId,
            name: pInfo.name || item.name,
            brand: pInfo.brand || item.brand,
            category: pInfo.category || item.category,
            changeType: 'Purchase',
            invoiceNo: pur.invoiceNo,
            quantityChange: Math.abs(item.quantityInNumbers),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Return Logs: returned items add back to stock
      const returnLogs = returns.flatMap((r) =>
        r.products.map((prod) => {
          const pInfo = productMap[prod.item_id] || {};
          return {
            date: r.createdAt,
            itemId: prod.item_id,
            name: pInfo.name || prod.name,
            brand: pInfo.brand || '',
            category: pInfo.category || '',
            changeType: 'Return',
            invoiceNo: r.returnNo,
            quantityChange: Math.abs(prod.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Damage Logs: damaged items reduce stock
      const damageLogs = damages.flatMap((d) =>
        d.damagedItems.map((item) => {
          const pInfo = productMap[item.item_id] || {};
          return {
            date: d.createdAt,
            itemId: item.item_id,
            name: pInfo.name || item.name,
            brand: pInfo.brand || '',
            category: pInfo.category || '',
            changeType: 'Damage',
            invoiceNo: null,
            quantityChange: -Math.abs(item.quantity),
            finalStock: pInfo.countInStock || 0,
          };
        })
      );

      // Opening Stock Logs: initial or manually added opening stocks
      const openingLogs = openings.map((o) => {
        const pInfo = productMap[o.item_id] || {};
        return {
          date: o.createdAt,
          itemId: o.item_id,
          name: pInfo.name || o.name,
          brand: pInfo.brand || '',
          category: pInfo.category || '',
          changeType: 'Opening Stock',
          invoiceNo: null,
          quantityChange: Math.abs(o.quantity),
          finalStock: pInfo.countInStock || 0,
        };
      });

      let logs = [
        ...billingLogs,
        ...purchaseLogs,
        ...returnLogs,
        ...damageLogs,
        ...openingLogs,
      ];

      // Sort logs by date ascending by default
      logs = logs.sort((a, b) => new Date(a.date) - new Date(b.date));

      res.json(logs);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to fetch stock logs.' });
    }
  })
);




export default productRouter;
