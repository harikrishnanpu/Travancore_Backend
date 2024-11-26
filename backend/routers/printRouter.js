import express from 'express';
import QRCode from 'qrcode';
import QrCodeDB from '../models/qrcodeVerificstionModal.js';
import { chromium } from 'playwright';
import Return from '../models/returnModal.js';

const printRouter = express.Router();



// Helper function to safely get values or return "N/A" if undefined
const safeGet = (value) => (value ? value : 'N/A');

printRouter.post('/generate-pdf', async (req, res) => {
  const {
    invoiceNo,
    invoiceDate,
    salesmanName,
    expectedDeliveryDate,
    deliveryStatus,
    paymentStatus,
    paymentAmount,
    paymentMethod,
    paymentReceivedDate,
    customerName,
    customerAddress,
    customerContactNumber,
    marketedBy,
    billingAmount,
    subTotal,
    cgst,
    sgst,
    discount,
    products,
  } = safeGet(req.body);

  // Safely handle products array
  const productList = Array.isArray(products) ? products : [];
  const totalProducts = productList.length;

  const productsPerPage = 15;

  if(!billingAmount){
    res.status(500).json({message: 'error' });
  }

  // Function to generate invoice content
  const generatePageHTML = ( 
    productsChunk,
    pageNumber,
    totalPages,
    showTotals
  ) => `
  <div class="invoice">
        <!-- Header Section -->
        <div class="header">
            <p style="font-weight: 900;">KK TRADING</p>
            <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
            <div>
                <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                <p>Salesman: <strong>${salesmanName}</strong></p>
                <p>Additional Info:</p>
            </div>
            <div>
                <p><strong>From:</strong></p>
                <p style="font-weight: bold;">KK TRADING</p>
                <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                <p style="font-size: 10px;">Alappuzha, 688503</p>
                <p style="font-size: 10px;">Contact: 0477 2080282</p>
                <p style="font-size: 10px;">tradeinkk@gmail.com</p>
            </div>
        </div>
        <div class="invoice-info">

        <div style="font-size: 10px;">
            <p><strong>Estimate To:</strong></p>
            <p style="font-weight: bold;">${customerName}</p>
            <p>${customerAddress}</p>
            <p>State: Kerala</p>
            <p>Contact: ${customerContactNumber}</p>
        </div>

        <div style="font-size: 10px;">
            <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
        </div>

        <div style="font-size: 10px;">
            <p><strong>Payment:</strong></p>
            <p>Amount Paid: ${paymentAmount} </p>
            <p>Payment Method: ${paymentMethod || ''}</p>
            <p>Received Date: ${paymentReceivedDate || ''} </p>
            <p>Remaining Amount: ${(parseFloat(billingAmount) - parseFloat( paymentAmount + discount )).toFixed(2)}  </p>
        </div>

        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
            <thead>
                <tr>
                    <th>Sl</th>
                    <th>Item Id</th>
                    <th>Item Name</th>
                    <th>QTY</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>QTY(nos)</th>
                    <th>Unit Rate + Tax</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                ${
                    productsChunk.length > 0
                      ? productsChunk.map((product,index) => `
                          <tr>
          <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                              <td>${safeGet(product.item_id)}</td>
                              <td>${safeGet(product.name)}</td>
                              <td>${safeGet(product.enteredQty)}</td>
                              <td>${safeGet(product.unit)}</td>
                              <td>${safeGet(product.sellingPrice)}</td>
                              <td>${safeGet(product.quantity)}</td>
                              <td>${safeGet(product.sellingPriceinQty)}</td>
                              <td>${(product.quantity * product.sellingPriceinQty).toFixed(2) || 'N/A'}</td>
                          </tr>`).join('')
                      : '<tr><td colspan="5">No Products Available</td></tr>'
                  }
            </tbody>
        </table>

        <!-- Totals Section -->
        ${showTotals ? `
        <div style="display: flex; justify-content: space-between;" class="totals">
            <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                <p><strong>Authorised Signatory:</strong></p>
                <p style="margin-top: 40px;">Date: ------------------------------</p>
                <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
            </div>
            <div>
                <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                <p>Round Off: <span>0.0</span></p>
                <p style="font-size: 15px;"><strong>Total Amount: <span>${(billingAmount)}</span></strong></p>
            </div>
        </div> ` : `` }

        <!-- Payment Instructions -->

        <!-- Footer Section -->
                <footer>Page ${pageNumber} of ${totalPages}</footer>
        <footer>
            <p>Thank you for your business! After 30 days of delivery no products will not be replaced.</p>
        </footer>
    </div>
  `;

  // Generate the full HTML content
  let combinedHTMLContent = '';
  const totalPages = Math.ceil(productList.length / productsPerPage);

  for (let i = 0; i < totalPages; i++) {
    const productsChunk = productList.slice(
      i * productsPerPage,
      (i + 1) * productsPerPage
    );
    const showTotals = i === totalPages - 1;
    combinedHTMLContent += generatePageHTML(
      productsChunk,
      i + 1,
      totalPages,
      showTotals
    );
  }

  const fullHTMLContent = `
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK INVOICE</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }
    </style>
    </head>
    <body>
    ${combinedHTMLContent}
    </body>
    </html>
`;

  // Generate the PDF using Playwright
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTMLContent, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10px', bottom: '10px', left: '10px', right: '10px' },
    });

    await browser.close();

    // Send the PDF as a response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=Invoice_${invoiceNo}.pdf`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// New route to send the HTML content directly

printRouter.post('/generate-invoice-html', async (req, res) => {
  try {
    let {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      customerName,
      customerAddress,
      customerContactNumber,
      marketedBy,
      billingAmount,
      subTotal,
      cgst,
      sgst,
      transportation,
      unloading,
      handling,
      discount,
      products,
      perItemDiscount,
      grandTotal
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo) {
      return res.status(400).json({ error: 'invoiceNo is required' });
    }

    // Safely handle products array
    const productList = Array.isArray(products) ? products : [];
    const totalProducts = productList.length;
    billingAmount = parseFloat(billingAmount) || 0;
    paymentAmount = parseFloat(paymentAmount) || 0;

    const productsPerPage = 15;

    const NewQrCodeId = `${invoiceNo}-${Date.now()}`

    if(NewQrCodeId){
        const qrcodeDb = new QrCodeDB({
            qrcodeId: NewQrCodeId,
            billId: invoiceNo,
        })

        await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Function to generate invoice content
    const generatePageHTML = (
      productsChunk,
      pageNumber,
      totalPages,
      showTotals
    ) => `
     <div class="invoice">
          <!-- Header Section -->
          <div class="header">
              <p style="font-weight: 900;">KK TRADING</p>
              <p style="font-size: 12px;margin-top: 10px;font-weight: 900;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
          </div>

          <!-- Invoice Information -->
          <div class="invoice-info">
              <div>
                  <p style="font-size: 12px;font-weight: bolder;">Estimate no: <strong>${invoiceNo}</strong></p>
                  <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
                  <p>Expected Delivery Date: <strong>${new Date(expectedDeliveryDate).toLocaleDateString()}</strong></p>
                  <p>Salesman: <strong>${salesmanName}</strong></p>
                  <p>Additional Info:</p>
              </div>
                        <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
              <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 50px; height: 50px;" />
          </div>
              <div>
                  <p><strong>From:</strong></p>
                  <p style="font-weight: bold;">KK TRADING</p>
                  <p style="font-size: 10px;">Moncompu, Chambakulam,Road</p>
                  <p style="font-size: 10px;">Alappuzha, 688503</p>
                  <p style="font-size: 10px;">Contact: 0477 2080282</p>
                  <p style="font-size: 10px;">tradeinkk@gmail.com</p>
              </div>
          </div>
          <div class="invoice-info">

          <div style="font-size: 10px;">
              <p><strong>Estimate To:</strong></p>
              <p style="font-weight: bold;">${customerName}</p>
              <p>${customerAddress}</p>
              <p>State: Kerala</p>
              <p>Contact: ${customerContactNumber}</p>
          </div>

          <div style="font-size: 10px;">
              <p style="font-size: 15px;"><strong>Estimate Bill</strong></p>
          </div>

          <div style="font-size: 10px;">
              <p><strong>Payment:</strong></p>
              <p>Amount Paid: ${paymentAmount} </p>
              <p>Payment Method: ${paymentMethod || ''}</p>
              <p>Received Date: ${paymentReceivedDate || ''} </p>
              <p>Remaining Amount: ${(billingAmount - paymentAmount).toFixed(2)}  </p>
          </div>

          </div>

          <!-- Invoice Table -->
          <table class="invoice-table">
              <thead>
                  <tr>
                      <th>Sl</th>
                      <th>Item Id</th>
                      <th>Item Name</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Price</th>
                      <th>Qty(Nos)</th>
                      <th>Unit Rate</th>
                      <th>Discount</th>
                      <th>Total Amount</th>
                  </tr>
              </thead>
              <tbody>
                  ${
                      productsChunk.length > 0
                        ? productsChunk.map((product, index) => `
                            <tr>
                                <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td> <!-- Correct serial number -->
                                <td>${safeGet(product.item_id)}</td>
                                <td>${safeGet(product.name)}</td>
                                <td>${safeGet(product.enteredQty)}</td>
                                <td>${safeGet(product.unit)}</td>
                                <td>${safeGet(product.sellingPrice)}</td>
                                <td>${safeGet(product.quantity)}</td>
                                <td>${safeGet(product.sellingPriceinQty)}</td>
                                <td>${(product.quantity * parseFloat(perItemDiscount)).toFixed(2)}</td>
                                <td>${((product.quantity * parseFloat(product.sellingPriceinQty)) - (product.quantity * parseFloat(perItemDiscount))).toFixed(2) || 'N/A'}</td>
                            </tr>`).join('')
                        : '<tr><td colspan="10">No Products Available</td></tr>'
                  }
              </tbody>
          </table>

          <!-- Totals Section -->
          ${showTotals ? `
          <div style="display: flex; justify-content: space-between;" class="totals">
              <div style="font-size: 10px;margin-top: 50px;" class="payment-instructions">
                  <p><strong>Authorised Signatory:</strong></p>
                  <p style="margin-top: 40px;">Date: ------------------------------</p>
                  <p style="font-weight: bold;text-align: center;margin-top: 20px;">KK TRADING</p>
              </div>
              <div>
                  <p>Subtotal: <span>${parseFloat(subTotal || 0).toFixed(2)}</span></p>
                  <p>Discount: <span>${parseFloat(discount || 0).toFixed(2)}</span></p>
                  <p>Cgst (9%): <span>${parseFloat(cgst || 0).toFixed(2)}</span></p>
                  <p>Sgst (9%): <span>${parseFloat(sgst || 0).toFixed(2)}</span></p>
                  <p>Total Amount: <span>${parseFloat(billingAmount || 0).toFixed(2)}</span></p>
                  <p>Transportation Charges: <span>${parseFloat(transportation || 0).toFixed(2)}</span></p>
                  <p>Unloading Charges: <span>${parseFloat(unloading || 0).toFixed(2)}</span></p>
                  <p>Handling Charge: <span>${parseFloat(handling || 0).toFixed(2)}</span></p>
                  <p>Round Off: <span>0.0</span></p>
                  <p style="font-size: 15px;"><strong>Grand Total: <span>${parseFloat(grandTotal || 0).toFixed(2)}</span></strong></p>
              </div>
          </div> ` : `` }

          <!-- Footer Section -->
                  <footer>Page ${pageNumber} of ${totalPages}</footer>
          <footer>
              <p>Thank you for your business! After 30 days of delivery no products will not be replaced.</p>
          </footer>
      </div>
    `;

    // Generate the full HTML content
    let combinedHTMLContent = '';
    const totalPages = Math.ceil(productList.length / productsPerPage);

    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(
        i * productsPerPage,
        (i + 1) * productsPerPage
      );
      const showTotals = i === totalPages - 1;
      combinedHTMLContent += generatePageHTML(
        productsChunk,
        i + 1,
        totalPages,
        showTotals
      );
    }

    const fullHTMLContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KK INVOICE</title>
      <style>
                * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
        }
        body {
            background-color: #f9f9f9;
        }
        .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: auto;
            page-break-after: always;
        }
        .header {
            background-color: #960101; /* Dark Red */
            padding: 20px;
            color: #fff;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        .invoice-info div {
            font-size: 10px;
            color: #333;
        }
        .address-section {
            display: flex;
            justify-content: space-between;
            margin: 20px 0;
        }
        .address-section div {
            width: 45%;
        }
        .address-section p {
            margin: 5px 0;
        }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 12px;
        }
        .invoice-table td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 10px;
        }
        .totals {
            margin-top: 20px;
            text-align: right;
        }
        .totals p {
            margin: 5px 0;
            font-size: 10px;
        }
        .totals span {
            font-weight: bold;
            color: #960101;
        }
        .payment-instructions {
            margin-top: 30px;
        }
        .qr-code-section img {
            width: 100px;
            height: 100px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #777;
        }


      @media print {
        body * {
          visibility: hidden;
        }
        #printable, #printable * {
          visibility: visible;
        }
        #printable {
          position: absolute;
          left: 0;
          top: 0;
        }
      }
    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div id="printable">
      ${combinedHTMLContent}
    </div>
  </body>
  </html>`;

    // Store the invoiceNo in the in-memory store
    // invoiceStore.add(invoiceNo);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});









// Route to generate purchase invoice HTML
// Route to generate purchase invoice HTML
printRouter.post('/generate-purchase-invoice-html', async (req, res) => {
  try {
    const {
      sellerId,
      sellerName,
      sellerAddress,
      sellerGst,
      invoiceNo,
      purchaseId,
      billingDate,
      invoiceDate,
      items,
      totals,
      transportationDetails,
    } = safeGet(req.body, '');

    // Validate required fields
    if (!invoiceNo || !purchaseId) {
      return res.status(400).json({ error: 'invoiceNo and purchaseId are required' });
    }

    // Safely handle items array
    const productList = Array.isArray(items) ? items : [];
    const totalProducts = productList.length;
    const billingAmount = parseFloat(totals.billingAmount) || 0;

    const productsPerPage = 15;
    const totalPages = Math.ceil(productList.length / productsPerPage);

    // Generate a unique QR Code ID
    const NewQrCodeId = `${invoiceNo}-${Date.now()}`;

    // Save QR Code ID to the database
    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: invoiceNo,
      });

      await qrcodeDb.save();
    }

    // Generate QR Code as Data URL
    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Function to generate invoice content per page
    const generatePageHTML = (productsChunk, pageNumber, totalPages, showTotals) => `
      <div class="invoice">
        <!-- Header Section -->
        <div class="header">
          <p style="font-weight: 900; font-size: 24px;">KK TRADING</p>
          <p style="font-size: 14px; margin-top: 5px; font-weight: 600;">Tiles, Granites, Sanitary Wares, UV Sheets</p>
        </div>

        <!-- Invoice Information -->
        <div class="invoice-info">
          <div>
            <p style="font-size: 14px; font-weight: bolder;">Purchase No: <strong>${invoiceNo}</strong></p>
            <p>Invoice Date: <strong>${new Date(invoiceDate).toLocaleDateString()}</strong></p>
            <p>Billing Date: <strong>${new Date(billingDate).toLocaleDateString()}</strong></p>
            <p>Seller: <strong>${sellerName}</strong></p>
          </div>

          <!-- QR Code Section -->
          <div class="qr-code-section" style="text-align: right;">
            <img src="${qrCodeDataURL}" alt="QR Code for Invoice" style="width: 80px; height: 80px;" />
          </div>

          <div>
            <p><strong>From:</strong></p>
            <p style="font-weight: bold;">KK TRADING</p>
            <p style="font-size: 12px;">Moncompu, Chambakulam, Road</p>
            <p style="font-size: 12px;">Alappuzha, 688503</p>
            <p style="font-size: 12px;">Contact: 0477 2080282</p>
            <p style="font-size: 12px;">tradeinkk@gmail.com</p>
          </div>
        </div>

        <div class="invoice-info">
          <!-- Seller Details -->
          <div style="font-size: 12px;">
            <p><strong>Seller Details:</strong></p>
            <p style="font-weight: bold;">${sellerName}</p>
            <p>${sellerAddress}</p>
            <p>State: Kerala</p>
            <p>GST: ${sellerGst || 'N/A'}</p>
            <p>Seller ID: ${sellerId}</p>
          </div>

          <!-- Transportation Details -->
          <div style="font-size: 12px;">
            <p><strong>Transportation Details:</strong></p>
            <p><strong>Logistic Transport:</strong></p>
            <p>Company: ${transportationDetails.logistic.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.logistic.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.logistic.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.logistic.remark || 'N/A'}</p>
            <br/>
            <p><strong>Local Transport:</strong></p>
            <p>Company: ${transportationDetails.local.transportCompanyName || 'N/A'}</p>
            <p>GST: ${transportationDetails.local.companyGst || 'N/A'}</p>
            <p>Transportation Charges: ₹${parseFloat(transportationDetails.local.transportationCharges || 0).toFixed(2)}</p>
            <p>Remark: ${transportationDetails.local.remark || 'N/A'}</p>
          </div>
        </div>

        <!-- Invoice Table -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th>Sl</th>
              <th>Item ID</th>
              <th>Item Name</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Purchased Qty</th>
              <th>Entered Qty</th>
              <th>Purchased Unit</th>
              <th>P.Unit</th>
              <th>S.Unit</th>
              <th>Bill Part Price</th>
              <th>Cash Part Price</th>
              <th>Allocated Other Expense</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${
              productsChunk.length > 0
                ? productsChunk
                    .map(
                      (product, index) => `
                <tr>
                  <td>${index + 1 + (pageNumber - 1) * productsPerPage}</td>
                  <td>${safeGet(product.itemId)}</td>
                  <td>${safeGet(product.name)}</td>
                  <td>${safeGet(product.brand) || 'N/A'}</td>
                  <td>${safeGet(product.category) || 'N/A'}</td>
                  <td>${safeGet(product.quantity)}</td>
                  <td>${safeGet(product.quantityInNumbers)}</td>
                  <td>${safeGet(product.pUnit) || 'N/A'}</td>
                  <td>${safeGet(product.pUnit) || 'N/A'}</td>
                  <td>${safeGet(product.sUnit) || 'N/A'}</td>
                  <td>₹${parseFloat(product.billPartPrice).toFixed(2)}</td>
                  <td>₹${parseFloat(product.cashPartPrice).toFixed(2)}</td>
                  <td>₹${parseFloat(product.allocatedOtherExpense).toFixed(2)}</td>
                  <td>₹${(
                    product.quantity *
                    (parseFloat(product.billPartPrice) + parseFloat(product.cashPartPrice))
                  ).toFixed(2)}</td>
                </tr>`
                    )
                    .join('')
                : '<tr><td colspan="14">No Products Available</td></tr>'
            }
          </tbody>
        </table>

        <!-- Totals Section -->
        ${
          showTotals
            ? `
        <div class="totals">
          <div style="font-size: 12px;">
            <p>Subtotal: ₹${parseFloat(totals.subTotal || 0).toFixed(2)}</p>
            <p>Discount: ₹${parseFloat(totals.discount || 0).toFixed(2)}</p>
            <p>CGST (9%): ₹${parseFloat(totals.cgst || 0).toFixed(2)}</p>
            <p>SGST (9%): ₹${parseFloat(totals.sgst || 0).toFixed(2)}</p>
            <p>Total Amount: ₹${parseFloat(totals.billingAmount || 0).toFixed(2)}</p>
            <p>Transportation Charges: ₹${parseFloat(totals.transportationCharges || 0).toFixed(2)}</p>
            <p>Unloading Charges: ₹${parseFloat(totals.unloadingCharge || 0).toFixed(2)}</p>
            <p>Insurance: ₹${parseFloat(totals.insurance || 0).toFixed(2)}</p>
            <p>Damage Price: ₹${parseFloat(totals.damagePrice || 0).toFixed(2)}</p>
            <p>Total Other Expenses: ₹${parseFloat(totals.totalOtherExpenses || 0).toFixed(2)}</p>
            <p>Grand Total Purchase Amount: ₹${parseFloat(totals.grandTotalPurchaseAmount || 0).toFixed(2)}</p>
          </div>
        </div>
        `
            : ``
        }

        <!-- Authorised Signatory Section -->
        ${
          showTotals
            ? `
        <div class="payment-instructions">
          <p><strong>Authorised Signatory:</strong></p>
          <p style="margin-top: 40px;">Date: ____________________________</p>
          <p style="font-weight: bold; text-align: center; margin-top: 20px;">KK TRADING</p>
        </div>
        `
            : ``
        }
      </div>
    `;

    // Generate the full HTML content
    let combinedHTMLContent = '';
    for (let i = 0; i < totalPages; i++) {
      const productsChunk = productList.slice(i * productsPerPage, (i + 1) * productsPerPage);
      const showTotals = i === totalPages - 1;
      combinedHTMLContent += generatePageHTML(productsChunk, i + 1, totalPages, showTotals);
    }

    const fullHTMLContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KK PURCHASE INVOICE - ${invoiceNo}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
          }
          body {
            background-color: #f9f9f9;
          }
          .invoice {
            background-color: #fff;
            width: 100%;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
            margin: 20px auto;
            page-break-after: always;
          }
          .header {
            background-color: #960101; /* Dark Red */
            padding: 10px 20px;
            color: #fff;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            border-top-left-radius: 10px;
            border-top-right-radius: 10px;
          }
          .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .invoice-info div {
            font-size: 14px;
            color: #333;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .invoice-table th {
            background-color: #f4cccc; /* Light Red */
            color: #960101; /* Dark Red */
            padding: 12px;
            border: 1px solid #ddd;
            font-size: 14px;
          }
          .invoice-table td {
            padding: 10px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 12px;
          }
          .totals {
            margin-top: 20px;
            text-align: right;
          }
          .totals p {
            margin: 5px 0;
            font-size: 14px;
          }
          .totals span {
            font-weight: bold;
            color: #960101;
          }
          .payment-instructions {
            margin-top: 30px;
          }
          .qr-code-section img {
            width: 80px;
            height: 80px;
          }
          footer {
            text-align: center;
            margin-top: 40px;
            font-size: 14px;
            color: #777;
          }

          @media print {
            body * {
              visibility: hidden;
            }
            #printable, #printable * {
              visibility: visible;
            }
            #printable {
              position: absolute;
              left: 0;
              top: 0;
            }
          }
        </style>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </head>
      <body>
        <div id="printable">
          ${combinedHTMLContent}
        </div>
      </body>
      </html>
    `;

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(fullHTMLContent);
  } catch (error) {
    console.error('Error generating purchase invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



printRouter.post('/verify-qr-code', async (req, res) => {
  try {
    const { qrcodeId } = req.body;

    if (!qrcodeId) {
      return res.status(400).json({ verified: false, message: 'qrcodeId is required' });
    }

    // Find the QR code in the database
    const qrCodeEntry = await QrCodeDB.findOne({ qrcodeId: qrcodeId });

    if (qrCodeEntry) {
      // QR code is found; it's our company's bill
      return res.status(200).json({
        verified: true,
        message: 'This is our company\'s bill.',
        billId: qrCodeEntry.billId,
      });
    } else {
      // QR code not found; it's not our company's bill
      return res.status(404).json({
        verified: false,
        message: 'This is not our company\'s bill.',
      });
    }
  } catch (error) {
    console.error('Error verifying QR Code:', error);
    res.status(500).json({ verified: false, message: 'Internal Server Error' });
  }
});





printRouter.post('/generate-return-invoice-html', async (req, res) => {
  try {
    const { returnNo } = req.body;

    // Validate required field
    if (!returnNo) {
      return res.status(400).json({ error: 'returnNo is required' });
    }

    // Fetch the return data from the database
    const returnData = await Return.findOne({ returnNo });

    if (!returnData) {
      return res.status(404).json({ error: 'Return data not found' });
    }

    // Generate QR Code as Data URL
    const NewQrCodeId = `${returnNo}-${Date.now()}`;

    if (NewQrCodeId) {
      const qrcodeDb = new QrCodeDB({
        qrcodeId: NewQrCodeId,
        billId: returnNo,
      });

      await qrcodeDb.save();
    }

    const qrCodeDataURL = await QRCode.toDataURL(NewQrCodeId);

    // Generate the HTML content
    const htmlContent = generateReturnInvoiceHTML(returnData, qrCodeDataURL);

    // Send the HTML as a response
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating return invoice:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Function to generate the return invoice HTML
function generateReturnInvoiceHTML(returnData, qrCodeDataURL) {
  const returnNo = safeGet(returnData.returnNo);
  const billingNo = safeGet(returnData.billingNo);
  const returnDate = safeGet(returnData.returnDate);
  const customerName = safeGet(returnData.customerName);
  const customerAddress = safeGet(returnData.customerAddress);
  const products = Array.isArray(returnData.products) ? returnData.products : [];
  const returnAmount = parseFloat(safeGet(returnData.returnAmount, 0));
  const totalTax = parseFloat(safeGet(returnData.totalTax, 0));
  const netReturnAmount = parseFloat(safeGet(returnData.netReturnAmount, 0));

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KK Trading - Return Invoice</title>
    <style>
      /* CSS styles */
      body {
        font-family: Arial, sans-serif;
      }
      .invoice {
        max-width: 800px;
        margin: auto;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 10px;
      }
      .header {
        text-align: center;
        background-color: #960101; /* Dark Red */
        color: #fff;
        padding: 20px;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
      }
      .header h1 {
        margin-bottom: 5px;
      }
      .invoice-info, .customer-info {
        margin-top: 20px;
      }
      .invoice-info div, .customer-info div {
        margin-bottom: 5px;
      }
      .qr-code {
        text-align: right;
        margin-top: -100px;
      }
      .products-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      .products-table th, .products-table td {
        border: 1px solid #ddd;
        padding: 8px;
      }
      .products-table th {
        background-color: #f4cccc; /* Light Red */
        color: #960101; /* Dark Red */
      }
      .totals {
        margin-top: 20px;
        text-align: right;
        font-size: 16px;
      }
      .totals p {
        margin: 5px 0;
      }
      footer {
        text-align: center;
        margin-top: 20px;
        font-size: 12px;
        color: #777;
      }
@media print {
    body {
        margin: 0;
        padding: 0;
        font-family: Arial, sans-serif;
        text-align: center; /* Ensure all text is centered */
    }

    .invoice {
        margin: 0 auto; /* Center the invoice horizontally */
        width: 100%; /* Adjust width as needed */
        max-width: 800px; /* Set a maximum width for the printed content */
        padding: 20px;
        border: none; /* Remove any borders to look clean */
        box-shadow: none; /* Remove shadows */
        page-break-inside: avoid; /* Avoid page breaks inside the invoice */
    }

    .header, .footer {
        text-align: center;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: auto; /* Center the table */
    }

    th, td {
        padding: 8px;
        border: 1px solid #ddd;
    }
}

    </style>
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
  </head>
  <body>
    <div class="invoice">
      <div class="header">
        <h1>KK TRADING</h1>
        <p>Tiles, Granites, Sanitary Wares, UV Sheets</p>
      </div>
      <div class="qr-code">
        <img src="${qrCodeDataURL}" alt="QR Code" width="100" height="100" />
      </div>
      <div class="invoice-info">
        <div><strong>Return Invoice No:</strong> ${returnNo}</div>
        <div><strong>Billing No:</strong> ${billingNo}</div>
        <div><strong>Return Date:</strong> ${new Date(returnDate).toLocaleDateString()}</div>
      </div>
      <div class="customer-info">
        <div><strong>Customer Name:</strong> ${customerName}</div>
        <div><strong>Customer Address:</strong> ${customerAddress}</div>
      </div>
      <table class="products-table">
        <thead>
          <tr>
            <th>Sl</th>
            <th>Item ID</th>
            <th>Name</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${
            products.length > 0
              ? products
                  .map(
                    (product, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${safeGet(product.item_id)}</td>
                <td>${safeGet(product.name)}</td>
                <td>${safeGet(product.quantity)}</td>
              </tr>
            `
                  )
                  .join('')
              : '<tr><td colspan="4">No products returned.</td></tr>'
          }
        </tbody>
      </table>
      <div class="totals">
        <p><strong>Return Amount:</strong> ₹${returnAmount.toFixed(2)}</p>
        <p><strong>Total Tax:</strong> ₹${totalTax.toFixed(2)}</p>
        <p><strong>Net Return Amount:</strong> ₹${netReturnAmount.toFixed(2)}</p>
      </div>
      <footer>
        <p>Thank you for your business!</p>
      </footer>
    </div>
  </body>
  </html>
  `;
}











export default printRouter;