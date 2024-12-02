import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import data from '../data.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import { isAdmin, isAuth } from '../utils.js';
import asyncHandler from 'express-async-handler';
import Purchase from '../models/purchasemodals.js';
import Log from '../models/Logmodal.js';
import SellerPayment from '../models/sellerPayments.js';
import TransportPayment from '../models/transportPayments.js';
import SupplierAccount from '../models/supplierAccountModal.js';
import Transportation from '../models/transportModal.js';


const productRouter = express.Router();

productRouter.get(
  '/',
  expressAsyncHandler(async (req, res) => {
    const pageSize = 20;
    const page = Number(req.query.pageNumber) || 1;
    const name = req.query.name ? req.query.name.toUpperCase() : '';
    const category = req.query.category ? req.query.category.toUpperCase() : '';
    const seller = req.query.seller ? req.query.seller.toUpperCase() : '';
    const order = req.query.order ? req.query.order.toUpperCase() : '';
    const min = req.query.min && Number(req.query.min) !== 0 ? Number(req.query.min) : 0;
    const max = req.query.max && Number(req.query.max) !== 0 ? Number(req.query.max) : 0;
    const rating = req.query.rating && Number(req.query.rating) !== 0 ? Number(req.query.rating) : 0;

    const nameFilter = name ? { name: { $regex: name, $options: 'i' } } : {};
    const categoryFilter = category ? { category } : {};
    const sellerFilter = seller ? { seller } : {};
    const priceFilter = min && max ? { price: { $gte: min, $lte: max } } : {};
    const ratingFilter = rating ? { rating: { $gte: rating } } : {};
    const sortOrder =
      order === 'lowest'
        ? { price: 1 }
        : order === 'highest'
        ? { price: -1 }
        : order === 'toprated'
        ? { rating: -1 }
        : { _id: -1 };

    try {
      let products;
      let count = 0;

      // Check if name is a valid item_id
      if (name) {
        const itemById = await Product.findOne({ item_id: name });
        if (itemById) {
          products = [itemById];
          count = 1;
        }
      }

      // If name is not an item_id, use regular filters
      if (!products) {
        count = await Product.countDocuments({
          ...sellerFilter,
          ...nameFilter,
          ...categoryFilter,
          ...priceFilter,
          ...ratingFilter,
        });

        products = await Product.find({
          ...sellerFilter,
          ...nameFilter,
          ...categoryFilter,
          ...priceFilter,
          ...ratingFilter,
        })
          .populate('seller', 'seller.name seller.logo')
          .sort(sortOrder)
          .skip(pageSize * (page - 1))
          .limit(pageSize);
      }

      res.send({ products, page, totalProducts: count, pages: Math.ceil(count / pageSize) });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
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
    const isItemId = /^K\d{1,4}$/.test(query);

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
  '/categories',
  expressAsyncHandler(async (req, res) => {
    const categories = await Product.find().distinct('category');
    res.send(categories);
  })
);





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
    const product = new Product({
      name: 'Product Name',
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
    res.send({ message: 'Product Created', product: createdProduct });
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
  const { countInStock } = req.body; // Extract countInStock from the request body

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

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error updating product stock' });
  }
});


productRouter.put(
  '/:id',
  isAuth,
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
      product.pUnit = req.body.pUnit;
      product.sUnit = req.body.sUnit;
      product.length = req.body.length;
      product.breadth = req.body.breadth;
      product.size = req.body.size;
      product.unit = req.body.unit;
      const updatedProduct = await product.save();
      res.send({ message: 'Product Updated', product: updatedProduct });
    } else {
      res.status(404).send({ message: 'Product Not Found' });
    }
  })
);

productRouter.delete(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (product) {
      const deleteProduct = await product.remove();
      res.send({ message: 'Product Deleted', product: deleteProduct });
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
    const {
      sellerId,
      sellerName,
      items,
      invoiceNo,
      sellerAddress,
      sellerGst,
      billingDate,
      invoiceDate,
      totals,
      transportationDetails,
    } = req.body;

    let { purchaseId } = req.body;

    // **1. Check if Purchase with the same invoiceNo or purchaseId already exists**

    try {
      const existingPurchase = await Purchase.findOne({
        $or: [{ invoiceNo }, { purchaseId }],
      });

      if (existingPurchase) {
        // Find the latest purchaseId that starts with 'KP' and is followed by digits
        const latestInvoice = await Purchase.findOne({ purchaseId: /^KP\d+$/ })
          .sort({ purchaseId: -1 })
          .collation({ locale: 'en', numericOrdering: true });

        if (!latestInvoice) {
          // If no invoice exists, start with 'KP1'
          purchaseId = 'KP1';
        } else {
          const latestInvoiceNo = latestInvoice.purchaseId;
          const numberPart = parseInt(latestInvoiceNo.replace('KP', ''), 10);
          const nextNumber = numberPart + 1;
          purchaseId = `KP${nextNumber}`;
        }
      }

      // Handle product updates or creation
      for (const item of items) {
        const existingProduct = await Product.findOne({ item_id: item.itemId });

        // Adjust stock based on quantityInNumbers
        const quantityInNumbers = parseFloat(item.quantityInNumbers).toFixed(2);

        if (existingProduct) {
          existingProduct.countInStock += quantityInNumbers;
          existingProduct.price = parseFloat(item.totalPriceInNumbers).toFixed(2);
          Object.assign(existingProduct, item); // Update product fields
          await existingProduct.save();
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            countInStock: quantityInNumbers,
            price: parseFloat(item.totalPriceInNumbers).toFixed(2),
          });
          await newProduct.save();
        }
      }

      // Save purchase details
      const purchase = new Purchase({
        sellerId,
        sellerName,
        invoiceNo,
        items: items.map((item) => ({
          ...item,
        })),
        purchaseId,
        sellerAddress,
        sellerGst,
        billingDate,
        invoiceDate,
        totals,
      });

      await purchase.save();

      // Save transportation details
      if (transportationDetails) {
        const { logistic, local, other } = transportationDetails;

        // Logistic Transportation
        if (
          logistic &&
          logistic.transportCompanyName &&
          logistic.transportationCharges !== undefined
        ) {
          const logisticTransport = new Transportation({
            purchaseId: logistic.purchaseId,
            invoiceNo: logistic.invoiceNo,
            transportType: 'logistic',
            companyGst: logistic.companyGst,
            billId: logistic.billId,
            transportCompanyName: logistic.transportCompanyName,
            transportationCharges: parseFloat(
              logistic.transportationCharges
            ),
            remarks: logistic.remark,
          });

          await logisticTransport.save();

          // Create billing entry for TransportPayment
          const logisticBillingEntry = {
            amount: parseFloat(logistic.transportationCharges),
            date: logistic.billingDate || Date.now(),
            billId: logistic.billId,
            invoiceNo: logistic.invoiceNo,
          };

          // Find existing TransportPayment
          let logisticTransportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (logisticTransportPayment) {
            logisticTransportPayment.billings.push(logisticBillingEntry);
            logisticTransportPayment.totalAmountBilled = logisticTransportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            logisticTransportPayment.paymentRemaining =
              logisticTransportPayment.totalAmountBilled -
              logisticTransportPayment.totalAmountPaid;
            await logisticTransportPayment.save();
          } else {
            const newLogisticTransportPayment = new TransportPayment({
              transportName: logistic.transportCompanyName,
              transportType: 'logistic',
              payments: [],
              billings: [logisticBillingEntry],
              totalAmountBilled: parseFloat(logistic.transportationCharges),
              totalAmountPaid: 0,
              paymentRemaining: parseFloat(logistic.transportationCharges),
            });

            await newLogisticTransportPayment.save();
          }
        }

        // Local Transportation
        if (
          local &&
          local.transportCompanyName &&
          local.transportationCharges !== undefined
        ) {
          const localTransport = new Transportation({
            purchaseId: local.purchaseId,
            invoiceNo: local.invoiceNo,
            transportType: 'local',
            companyGst: local.companyGst,
            billId: local.billId,
            transportCompanyName: local.transportCompanyName,
            transportationCharges: parseFloat(local.transportationCharges),
            remarks: local.remark,
          });

          await localTransport.save();

          // Create billing entry for TransportPayment
          const localBillingEntry = {
            amount: parseFloat(local.transportationCharges),
            date: local.billingDate || Date.now(),
            billId: local.billId,
            invoiceNo: local.invoiceNo,
          };

          // Find existing TransportPayment
          let localTransportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (localTransportPayment) {
            localTransportPayment.billings.push(localBillingEntry);
            localTransportPayment.totalAmountBilled = localTransportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            localTransportPayment.paymentRemaining =
              localTransportPayment.totalAmountBilled -
              localTransportPayment.totalAmountPaid;
            await localTransportPayment.save();
          } else {
            const newLocalTransportPayment = new TransportPayment({
              transportName: local.transportCompanyName,
              transportType: 'local',
              payments: [],
              billings: [localBillingEntry],
              totalAmountBilled: parseFloat(local.transportationCharges),
              totalAmountPaid: 0,
              paymentRemaining: parseFloat(local.transportationCharges),
            });

            await newLocalTransportPayment.save();
          }
        }
      }

      // Add billing to SellerPayment
      const sellerPayment = await SellerPayment.findOne({ sellerId });

      const billingEntry = {
        amount: totals.totalPurchaseAmount,
        date: billingDate || Date.now(),
        purchaseId: purchaseId,
        invoiceNo: invoiceNo,
      };

      if (sellerPayment) {
        sellerPayment.billings.push(billingEntry);
        sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
          (sum, billing) => sum + billing.amount,
          0
        );
        sellerPayment.paymentRemaining =
          sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
        await sellerPayment.save();
      } else {
        const newSellerPayment = new SellerPayment({
          sellerId,
          sellerName,
          payments: [],
          billings: [billingEntry],
          totalAmountBilled: totals.totalPurchaseAmount,
          totalAmountPaid: 0,
          paymentRemaining: totals.totalPurchaseAmount,
        });

        await newSellerPayment.save();
      }

      // === Update SupplierAccount ===
      let supplierAccount = await SupplierAccount.findOne({ sellerId });

      const billEntry = {
        invoiceNo: invoiceNo,
        billAmount: totals.totalPurchaseAmount,
        invoiceDate: invoiceDate || Date.now(),
      };

      if (supplierAccount) {
        const existingBillIndex = supplierAccount.bills.findIndex(
          (bill) => bill.invoiceNo === invoiceNo
        );

        if (existingBillIndex === -1) {
          supplierAccount.bills.push(billEntry);
        } else {
          supplierAccount.bills[existingBillIndex] = billEntry;
        }

        supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
          (sum, bill) => sum + bill.billAmount,
          0
        );
        supplierAccount.pendingAmount =
          supplierAccount.totalBillAmount - supplierAccount.paidAmount;

        await supplierAccount.save();
      } else {
        supplierAccount = new SupplierAccount({
          sellerId,
          sellerName,
          sellerAddress,
          bills: [billEntry],
          payments: [],
          totalBillAmount: totals.totalPurchaseAmount,
          paidAmount: 0,
          pendingAmount: totals.totalPurchaseAmount,
        });

        await supplierAccount.save();
      }

      res.json(purchaseId);
    } catch (error) {
      console.error('Error creating purchase:', error);
      res.status(500).json({ message: 'Error creating purchase', error });
    }
  })
);

productRouter.put(
  '/purchase/:purchaseId',
  asyncHandler(async (req, res) => {
    const { purchaseId } = req.params;
    const {
      sellerId,
      sellerName,
      invoiceNo,
      items,
      sellerAddress,
      sellerGst,
      billingDate,
      invoiceDate,
      totals,
      transportationDetails,
    } = req.body;

    try {
      const existingPurchase = await Purchase.findOne({ purchaseId });
      if (!existingPurchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }

      const oldSellerId = existingPurchase.sellerId;
      const oldSellerName = existingPurchase.sellerName;
      const oldInvoiceNo = existingPurchase.invoiceNo;

      // Extract old transportation details if they exist
      const oldTransport = existingPurchase.transportationDetails || {};

      // Map old quantities for stock adjustment
      const oldItemMap = new Map();
      for (const item of existingPurchase.items) {
        oldItemMap.set(item.itemId, item.quantityInNumbers);
      }

      for (const item of items) {
        const product = await Product.findOne({ item_id: item.itemId });

        const oldQuantityInNumbers = oldItemMap.get(item.itemId) || 0;
        const newQuantityInNumbers = parseFloat(item.quantityInNumbers).toFixed(2);

        if (product) {
          product.countInStock += newQuantityInNumbers - oldQuantityInNumbers;
          product.price = parseFloat(item.totalPriceInNumbers).toFixed(2); // Ensure price is a number
          Object.assign(product, item); // Update product fields
          await product.save();
        } else {
          const newProduct = new Product({
            item_id: item.itemId,
            ...item,
            countInStock: newQuantityInNumbers,
            price: parseFloat(item.totalPriceInNumbers).toFixed(2),
          });
          await newProduct.save();
        }
      }

      // Update purchase details
      existingPurchase.sellerId = sellerId;
      existingPurchase.sellerName = sellerName;
      existingPurchase.invoiceNo = invoiceNo;
      existingPurchase.items = items.map((item) => ({
        ...item,
      }));
      existingPurchase.sellerAddress = sellerAddress;
      existingPurchase.sellerGst = sellerGst;
      existingPurchase.billingDate = billingDate || existingPurchase.billingDate;
      existingPurchase.invoiceDate = invoiceDate || existingPurchase.invoiceDate;
      existingPurchase.totals = totals;

      // Update transportation details
      existingPurchase.transportationDetails = transportationDetails || existingPurchase.transportationDetails;

      await existingPurchase.save();

      // === Update SupplierAccount ===
      if (oldSellerId !== sellerId) {
        // Supplier has changed
        // Remove bill from old supplier account
        const oldSupplierAccount = await SupplierAccount.findOne({ sellerId: oldSellerId });
        if (oldSupplierAccount) {
          oldSupplierAccount.bills = oldSupplierAccount.bills.filter(
            (bill) => bill.invoiceNo !== oldInvoiceNo
          );
          oldSupplierAccount.totalBillAmount = oldSupplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          oldSupplierAccount.pendingAmount =
            oldSupplierAccount.totalBillAmount - oldSupplierAccount.paidAmount;
          await oldSupplierAccount.save();
        }

        // Add bill to new supplier account
        let newSupplierAccount = await SupplierAccount.findOne({ sellerId });
        const billEntry = {
          invoiceNo: invoiceNo,
          billAmount: totals.totalPurchaseAmount,
          invoiceDate: invoiceDate || Date.now(),
        };

        if (newSupplierAccount) {
          newSupplierAccount.bills.push(billEntry);
          newSupplierAccount.totalBillAmount = newSupplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          newSupplierAccount.pendingAmount =
            newSupplierAccount.totalBillAmount - newSupplierAccount.paidAmount;
          await newSupplierAccount.save();
        } else {
          newSupplierAccount = new SupplierAccount({
            sellerId,
            sellerName,
            sellerAddress,
            bills: [billEntry],
            payments: [],
            totalBillAmount: totals.totalPurchaseAmount,
            paidAmount: 0,
            pendingAmount: totals.totalPurchaseAmount,
          });

          await newSupplierAccount.save();
        }
      } else {
        // Supplier has not changed
        const supplierAccount = await SupplierAccount.findOne({ sellerId });
        if (supplierAccount) {
          const billIndex = supplierAccount.bills.findIndex(
            (bill) => bill.invoiceNo === oldInvoiceNo
          );
          if (billIndex !== -1) {
            supplierAccount.bills[billIndex] = {
              ...supplierAccount.bills[billIndex],
              invoiceNo: invoiceNo,
              billAmount: totals.totalPurchaseAmount,
              invoiceDate: invoiceDate || Date.now(),
            };
          } else {
            supplierAccount.bills.push({
              invoiceNo: invoiceNo,
              billAmount: totals.totalPurchaseAmount,
              invoiceDate: invoiceDate || Date.now(),
            });
          }
          supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
            (sum, bill) => sum + bill.billAmount,
            0
          );
          supplierAccount.pendingAmount =
            supplierAccount.totalBillAmount - supplierAccount.paidAmount;
          await supplierAccount.save();
        }
      }

      // === Update SellerPayment ===
      try {
        if (oldSellerId !== sellerId) {
          // Supplier has changed

          // Remove billing from old seller
          const oldSellerPayment = await SellerPayment.findOne({ sellerId: oldSellerId });
          if (oldSellerPayment) {
            const originalBillingsLength = oldSellerPayment.billings.length;
            oldSellerPayment.billings = oldSellerPayment.billings.filter(
              (billing) => billing.purchaseId !== purchaseId
            );

            // Check if a billing was removed
            if (oldSellerPayment.billings.length < originalBillingsLength) {
              oldSellerPayment.totalAmountBilled = oldSellerPayment.billings.reduce(
                (sum, billing) => sum + billing.amount,
                0
              );
              oldSellerPayment.paymentRemaining =
                oldSellerPayment.totalAmountBilled - oldSellerPayment.totalAmountPaid;

              await oldSellerPayment.save();
            }
          }

          // Prepare billing entry for the new seller
          const billingEntry = {
            amount: totals.totalPurchaseAmount,
            date: billingDate || new Date(),
            purchaseId, // Ensure purchaseId is included
            invoiceNo,
          };

          // Update or create new seller payment
          const newSellerPayment = await SellerPayment.findOne({ sellerId });

          if (newSellerPayment) {
            // Check if the billing already exists to prevent duplicates
            const existingBillingIndex = newSellerPayment.billings.findIndex(
              (billing) => billing.purchaseId === purchaseId
            );

            if (existingBillingIndex !== -1) {
              // Update existing billing
              newSellerPayment.billings[existingBillingIndex] = billingEntry;
            } else {
              // Add new billing
              newSellerPayment.billings.push(billingEntry);
            }

            newSellerPayment.totalAmountBilled = newSellerPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            newSellerPayment.paymentRemaining =
              newSellerPayment.totalAmountBilled - newSellerPayment.totalAmountPaid;

            await newSellerPayment.save();
          } else {
            // Create a new SellerPayment document
            const createdSellerPayment = new SellerPayment({
              sellerId,
              sellerName,
              payments: [], // Assuming payments are managed elsewhere
              billings: [billingEntry],
              totalAmountBilled: totals.totalPurchaseAmount,
              totalAmountPaid: 0,
              paymentRemaining: totals.totalPurchaseAmount,
            });

            await createdSellerPayment.save();
          }
        } else {
          // Supplier has not changed

          const sellerPayment = await SellerPayment.findOne({ sellerId });
          if (sellerPayment) {
            const billingIndex = sellerPayment.billings.findIndex(
              (billing) => billing.purchaseId === purchaseId
            );

            if (billingIndex !== -1) {
              // Update existing billing
              sellerPayment.billings[billingIndex] = {
                ...sellerPayment.billings[billingIndex],
                amount: totals.totalPurchaseAmount,
                date: billingDate || new Date(),
                invoiceNo,
                // Ensure purchaseId remains intact
                purchaseId: sellerPayment.billings[billingIndex].purchaseId || purchaseId,
              };
            } else {
              // Add new billing
              sellerPayment.billings.push({
                amount: totals.totalPurchaseAmount,
                date: billingDate || new Date(),
                purchaseId, // Ensure purchaseId is included
                invoiceNo,
              });
            }

            // Recalculate totals
            sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            sellerPayment.paymentRemaining =
              sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;

            await sellerPayment.save();
          } else {
            // Handle the case where sellerPayment does not exist
            // Create a new SellerPayment
            const billingEntry = {
              amount: totals.totalPurchaseAmount,
              date: billingDate || new Date(),
              purchaseId, // Ensure purchaseId is included
              invoiceNo,
            };

            const newSellerPayment = new SellerPayment({
              sellerId,
              sellerName,
              payments: [],
              billings: [billingEntry],
              totalAmountBilled: totals.totalPurchaseAmount,
              totalAmountPaid: 0,
              paymentRemaining: totals.totalPurchaseAmount,
            });

            await newSellerPayment.save();
          }
        }
      } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'An error occurred while processing the seller payments.' });
      }

      // === Update TransportPayment ===

      // Remove old transport billing if exists
      if (oldTransport.transportCompanyName && oldTransport.transportType) {
        const transportPayment = await TransportPayment.findOne({
          transportName: oldTransport.transportCompanyName,
          transportType: oldTransport.transportType,
        });

        if (transportPayment) {
          transportPayment.billings = transportPayment.billings.filter(
            (billing) => billing.billId !== oldTransport.billId
          );

          transportPayment.totalAmountBilled = transportPayment.billings.reduce(
            (sum, billing) => sum + billing.amount,
            0
          );
          transportPayment.paymentRemaining =
            transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;

          await transportPayment.save();
        }
      }

      // Add new transport billing if transportationDetails are provided
      if (transportationDetails) {
        const { logistic, local, other } = transportationDetails;

        // Logistic Transportation
        if (
          logistic &&
          logistic.transportCompanyName &&
          logistic.transportationCharges !== undefined
        ) {
          const logisticBillingEntry = {
            amount: parseFloat(logistic.transportationCharges).toFixed(2),
            date: logistic.billingDate || Date.now(),
            billId: logistic.billId,
            invoiceNo: logistic.invoiceNo,
          };

          let logisticTransportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (logisticTransportPayment) {
            logisticTransportPayment.billings.push(logisticBillingEntry);
            logisticTransportPayment.totalAmountBilled = logisticTransportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            logisticTransportPayment.paymentRemaining =
              logisticTransportPayment.totalAmountBilled -
              logisticTransportPayment.totalAmountPaid;
            await logisticTransportPayment.save();
          } else {
            const newLogisticTransportPayment = new TransportPayment({
              transportName: logistic.transportCompanyName,
              transportType: 'logistic',
              payments: [],
              billings: [logisticBillingEntry],
              totalAmountBilled: parseFloat(logistic.transportationCharges).toFixed(2),
              totalAmountPaid: 0,
              paymentRemaining: parseFloat(logistic.transportationCharges).toFixed(2),
            });

            await newLogisticTransportPayment.save();
          }
        }

        // Local Transportation
        if (
          local &&
          local.transportCompanyName &&
          local.transportationCharges !== undefined
        ) {
          const localBillingEntry = {
            amount: parseFloat(local.transportationCharges).toFixed(2),
            date: local.billingDate || Date.now(),
            billId: local.billId,
            invoiceNo: local.invoiceNo,
          };

          let localTransportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (localTransportPayment) {
            localTransportPayment.billings.push(localBillingEntry);
            localTransportPayment.totalAmountBilled = localTransportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            localTransportPayment.paymentRemaining =
              localTransportPayment.totalAmountBilled -
              localTransportPayment.totalAmountPaid;
            await localTransportPayment.save();
          } else {
            const newLocalTransportPayment = new TransportPayment({
              transportName: local.transportCompanyName,
              transportType: 'local',
              payments: [],
              billings: [localBillingEntry],
              totalAmountBilled: parseFloat(local.transportationCharges).toFixed(2),
              totalAmountPaid: 0,
              paymentRemaining: parseFloat(local.transportationCharges).toFixed(2),
            });

            await newLocalTransportPayment.save();
          }
        }

        // Other Expenses
        // Handle other expenses if necessary
        // Example:
        if (other && other.description && other.amount !== undefined) {
          const otherBillingEntry = {
            amount: parseFloat(other.amount).toFixed(2),
            date: other.billingDate || Date.now(),
            billId: other.billId,
            invoiceNo: other.invoiceNo,
            description: other.description,
          };

          let otherTransportPayment = await TransportPayment.findOne({
            transportName: other.transportCompanyName,
            transportType: 'other',
          });

          if (otherTransportPayment) {
            otherTransportPayment.billings.push(otherBillingEntry);
            otherTransportPayment.totalAmountBilled = otherTransportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            otherTransportPayment.paymentRemaining =
              otherTransportPayment.totalAmountBilled -
              otherTransportPayment.totalAmountPaid;
            await otherTransportPayment.save();
          } else {
            const newOtherTransportPayment = new TransportPayment({
              transportName: other.transportCompanyName,
              transportType: 'other',
              payments: [],
              billings: [otherBillingEntry],
              totalAmountBilled: parseFloat(other.amount).toFixed(2),
              totalAmountPaid: 0,
              paymentRemaining: parseFloat(other.amount).toFixed(2),
            });

            await newOtherTransportPayment.save();
          }
        }

       // Update Transportation document
if (transportationDetails) {
  const { logistic, local } = transportationDetails;

  // Update logistic transportation details
  if (logistic) {
    const transport = await Transportation.findOne({
      purchaseId: purchaseId,
      transportType: 'logistic',
    });

    if (transport) {
      transport.invoiceNo = logistic.invoiceNo;
      transport.transportCompanyName = logistic.transportCompanyName;
      transport.transportationCharges = parseFloat(logistic.transportationCharges).toFixed(2);
      transport.companyGst = logistic.companyGst;
      transport.remarks = logistic.remark;
      transport.billId = logistic.billId;
      await transport.save();
    } else {
      const newTransport = new Transportation({
        purchaseId: purchaseId,
        invoiceNo: logistic.invoiceNo,
        transportType: 'logistic',
        companyGst: logistic.companyGst,
        billId: logistic.billId,
        transportCompanyName: logistic.transportCompanyName,
        transportationCharges: parseFloat(logistic.transportationCharges).toFixed(2),
        remarks: logistic.remark,
      });

      await newTransport.save();
    }
  }

  // Update local transportation details
  if (local) {
    const transport = await Transportation.findOne({
      purchaseId: purchaseId,
      transportType: 'local',
    });

    if (transport) {
      transport.invoiceNo = local.invoiceNo;
      transport.transportCompanyName = local.transportCompanyName;
      transport.transportationCharges = parseFloat(local.transportationCharges).toFixed(2);
      transport.companyGst = local.companyGst;
      transport.remarks = local.remark;
      transport.billId = local.billId;
      await transport.save();
    } else {
      const newTransport = new Transportation({
        purchaseId: purchaseId,
        invoiceNo: local.invoiceNo,
        transportType: 'local',
        companyGst: local.companyGst,
        billId: local.billId,
        transportCompanyName: local.transportCompanyName,
        transportationCharges: parseFloat(local.transportationCharges).toFixed(2),
        remarks: local.remark,
      });

      await newTransport.save();
    }
  }
}


      }

      res.status(200).json({
        message: 'Purchase updated successfully',
        purchase: existingPurchase,
      });
    } catch (error) {
      console.log('Error updating purchase:', error);
      res.status(500).json({ message: 'Error updating purchase', error: error.message });
    }
  })
);

productRouter.delete(
  '/purchases/delete/:id',
  asyncHandler(async (req, res) => {
    try {
      const purchase = await Purchase.findById(req.params.id);

      if (!purchase) {
        return res.status(404).json({ message: 'Purchase not found' });
      }

      // Adjust product stock
      for (let item of purchase.items) {
        const product = await Product.findOne({ item_id: item.itemId });

        if (product) {
          product.countInStock -= parseFloat(item.quantityInNumbers);

          if (product.countInStock < 0) {
            product.countInStock = 0; // Ensure stock doesn't go below zero
          }

          await product.save(); // Save the updated product
        }
      }

      const sellerId = purchase.sellerId;
      const invoiceNo = purchase.invoiceNo;
      const purchaseId = purchase._id;

      // Remove bill from SupplierAccount
      const supplierAccount = await SupplierAccount.findOne({ sellerId });
      if (supplierAccount) {
        supplierAccount.bills = supplierAccount.bills.filter(
          (bill) => bill.invoiceNo !== invoiceNo
        );
        supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
          (sum, bill) => sum + bill.billAmount,
          0
        );
        supplierAccount.pendingAmount =
          supplierAccount.totalBillAmount - supplierAccount.paidAmount;
        await supplierAccount.save();
      }

      // Remove billing from SellerPayment
      const sellerPayment = await SellerPayment.findOne({ sellerId });
      if (sellerPayment) {
        sellerPayment.billings = sellerPayment.billings.filter(
          (billing) => billing.purchaseId.toString() !== purchaseId.toString()
        );
        sellerPayment.totalAmountBilled = sellerPayment.billings.reduce(
          (sum, billing) => sum + billing.amount,
          0
        );
        sellerPayment.paymentRemaining =
          sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
        await sellerPayment.save();
      }

      // Handle transportation payments if transportation details exist
      if (purchase.transportationDetails) {
        const { logistic, local } = purchase.transportationDetails;

        // Remove logistic transportation billing if exists
        if (logistic) {
          const transportPayment = await TransportPayment.findOne({
            transportName: logistic.transportCompanyName,
            transportType: 'logistic',
          });

          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== logistic.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }
        }

        // Remove local transportation billing if exists
        if (local) {
          const transportPayment = await TransportPayment.findOne({
            transportName: local.transportCompanyName,
            transportType: 'local',
          });

          if (transportPayment) {
            transportPayment.billings = transportPayment.billings.filter(
              (billing) => billing.billId !== local.billId
            );
            transportPayment.totalAmountBilled = transportPayment.billings.reduce(
              (sum, billing) => sum + billing.amount,
              0
            );
            transportPayment.paymentRemaining =
              transportPayment.totalAmountBilled - transportPayment.totalAmountPaid;
            await transportPayment.save();
          }
        }
      }

      // Delete the purchase
      await purchase.remove();

      res.send({ message: 'Purchase Deleted' });
    } catch (error) {
      console.error('Error deleting purchase:', error);
      res.status(500).send({ message: 'Error Occurred', error: error.message });
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
    const item = await Product.findOne({ item_id: /^K\d+$/ })
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




export default productRouter;
