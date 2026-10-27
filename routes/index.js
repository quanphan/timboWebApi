const express = require('express');
const mongoose = require('mongoose');
const { createAuthController } = require('../controllers/authController');
const { createCatalogController, createContentController } = require('../controllers/catalogController');
const { createCatalogAdminController, createPublicCatalogController } = require('../controllers/catalogAdminController');
const { createCustomBuildController } = require('../controllers/customBuildController');
const { createWizardSetupController } = require('../controllers/wizardSetupController');
const { createAuthenticate, requireAdmin, requirePermission } = require('../middleware/authenticate');
const { requireJson } = require('../middleware/requireJson');
const { createSensitiveLimiter } = require('../middleware/rateLimit');
const { createAuthService } = require('../services/authService');
const { createAccountService } = require('../services/accountService');
const { createProductService } = require('../services/productService');
const { createCartService } = require('../services/cartService');
const { createReviewService } = require('../services/reviewService');
const { createBrandSettingsController } = require('../controllers/brandSettingsController');
const { createContactService } = require('../services/contactService');
const { createNotificationService } = require('../services/email/notificationService');
const { createBrandSettingsService } = require('../services/brandSettingsService');
const { createPostService } = require('../services/postService');
const { createGalleryController } = require('../controllers/galleryController');
const { createGalleryService } = require('../services/galleryService');
const { createPageContentController } = require('../controllers/pageContentController');
const { createPageContentService } = require('../services/pageContentService');
const { createGalleryUploadMiddleware } = require('../services/galleryUploadService');
const { createCustomBuildUploadMiddleware, createUploadMiddleware } = require('../services/uploadService');
const { createCatalogTermService } = require('../services/catalogTermService');
const { sendData } = require('../utils/http');

function createApiRouter(config) {
    const router = express.Router();
    const authenticate = createAuthenticate(config);
    const limitSensitive = createSensitiveLimiter(config);
    const auth = createAuthController(createAuthService(config), createAccountService());
    const catalog = createCatalogController({
        productService: createProductService(),
        cartService: createCartService(),
        reviewService: createReviewService(),
    });
    const content = createContentController({
        contactService: createContactService({ notifications: createNotificationService(config) }),
        postService: createPostService(),
    });
    const customBuild = createCustomBuildController(config);
    const customBuildUpload = createCustomBuildUploadMiddleware(config);
    const wizardSetup = createWizardSetupController();
    const uploadImage = createUploadMiddleware(config);
    const catalogTerms = createCatalogTermService();
    const catalogAdmin = createCatalogAdminController({
        catalogTermService: catalogTerms,
        productService: createProductService(),
    });
    const publicCatalog = createPublicCatalogController(catalogTerms);
    const brandSettings = createBrandSettingsController(createBrandSettingsService());
    const gallery = createGalleryController(createGalleryService(config));
    const galleryUpload = createGalleryUploadMiddleware(config);
    const pageContent = createPageContentController(createPageContentService(config));

    router.get('/health', (req, res) => {
        const ready = mongoose.connection.readyState === 1;
        if (!ready) {
            res.status(503).json({
                success: false,
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Database is not ready.',
                },
            });
            return;
        }
        sendData(res, {
            status: 'ok',
            service: 'phanquan-guitars-api',
            database: 'up',
            timestamp: new Date().toISOString(),
        });
    });

    router.post('/auth/register', limitSensitive, requireJson, auth.register);
    router.post('/auth/login', limitSensitive, requireJson, auth.login);
    router.post('/auth/refresh', requireJson, auth.refresh);
    router.post('/auth/logout', requireJson, auth.logout);
    router.post('/auth/google', limitSensitive, requireJson, auth.google);

    router.get('/account/me', authenticate, auth.me);
    router.put('/account/me', authenticate, requireJson, auth.updateMe);
    router.put('/account/password', authenticate, requireJson, auth.changePassword);

    router.get('/admin/users', authenticate, requirePermission('users.read'), auth.listUsers);
    router.post('/admin/users/admins', authenticate, requirePermission('users.create_admin'), requireJson, auth.createAdmin);
    router.get('/admin/users/:id', authenticate, requirePermission('users.read'), auth.getUser);
    router.patch('/admin/users/:id/role', authenticate, requirePermission('users.update_role'), requireJson, auth.updateUserRole);
    router.patch('/admin/users/:id/status', authenticate, requirePermission('users.update_status'), requireJson, auth.updateUserStatus);
    router.put('/admin/users/:id', authenticate, requireAdmin, requireJson, auth.updateUser);
    router.delete('/admin/users/:id', authenticate, requirePermission('users.update_status'), auth.deleteUser);

    router.get('/products/types', catalog.productTypes);
    router.get('/products/brands', catalog.productBrands);
    router.get('/products', catalog.listProducts);
    router.get('/products/:id', catalog.getProduct);
    router.get('/products/:productId/reviews', catalog.listReviews);
    router.post('/products/:productId/reviews', authenticate, requireJson, catalog.createReview);

    router.post('/admin/products', authenticate, requirePermission('catalog.write'), requireJson, catalog.createProduct);
    router.put('/admin/products/:id', authenticate, requirePermission('catalog.write'), requireJson, catalog.updateProduct);
    router.delete('/admin/products/:id', authenticate, requirePermission('catalog.delete'), catalog.deleteProduct);

    router.get('/catalog/:kind', publicCatalog.listTerms);
    router.get('/admin/catalog/products', authenticate, requirePermission('catalog.read'), catalogAdmin.listProducts);
    router.post('/admin/catalog/products', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.createProduct);
    router.patch('/admin/catalog/products/reorder', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.reorderProducts);
    router.get('/admin/catalog/products/:id', authenticate, requirePermission('catalog.read'), catalogAdmin.getProduct);
    router.patch('/admin/catalog/products/:id', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.updateProduct);
    router.get('/admin/catalog/:kind', authenticate, requirePermission('catalog.read'), catalogAdmin.listTerms);
    router.post('/admin/catalog/:kind', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.createTerm);
    router.patch('/admin/catalog/:kind/reorder', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.reorderTerms);
    router.get('/admin/catalog/:kind/:id', authenticate, requirePermission('catalog.read'), catalogAdmin.getTerm);
    router.patch('/admin/catalog/:kind/:id', authenticate, requirePermission('catalog.write'), requireJson, catalogAdmin.updateTerm);
    router.delete('/admin/catalog/:kind/:id', authenticate, requirePermission('catalog.delete'), catalogAdmin.deleteTerm);

    router.get('/cart', authenticate, catalog.getCart);
    router.post('/cart/items', authenticate, requireJson, catalog.addCartItem);
    router.patch('/cart/items/:productId', authenticate, requireJson, catalog.updateCartItem);
    router.delete('/cart/items/:productId', authenticate, catalog.removeCartItem);
    router.post('/cart/merge', authenticate, requireJson, catalog.mergeCart);

    router.get('/brand-settings/public', brandSettings.getPublic);
    router.get('/brand-settings/admin', authenticate, requireAdmin, brandSettings.getAdmin);
    router.put('/brand-settings/admin', authenticate, requireAdmin, requireJson, brandSettings.updateAdmin);

    router.get('/pages/:pageKey', pageContent.getPublic);
    router.get('/admin/page-content/media/orphans', authenticate, requireAdmin, pageContent.listOrphans);
    router.post('/admin/page-content/media/orphans/delete', authenticate, requireAdmin, requirePermission('uploads.write'), requireJson, pageContent.deleteOrphans);
    router.get('/admin/page-content/:pageKey', authenticate, requireAdmin, pageContent.getAdmin);
    router.get('/admin/page-content/:pageKey/preview', authenticate, requireAdmin, pageContent.preview);
    router.put('/admin/page-content/:pageKey/draft', authenticate, requireAdmin, requireJson, pageContent.saveDraft);
    router.post('/admin/page-content/:pageKey/publish', authenticate, requireAdmin, requireJson, pageContent.publish);
    router.post('/admin/page-content/:pageKey/revert', authenticate, requireAdmin, requireJson, pageContent.revert);

    router.post('/contact', limitSensitive, requireJson, content.createMessage);
    router.get('/admin/messages', authenticate, requireAdmin, content.listMessages);
    router.get('/admin/messages/:id', authenticate, requireAdmin, content.getMessage);
    router.delete('/admin/messages/:id', authenticate, requireAdmin, content.deleteMessage);

    router.get('/posts', content.listPosts);
    router.get('/posts/:id', content.getPost);
    router.post('/admin/posts', authenticate, requireAdmin, requireJson, content.createPost);
    router.put('/admin/posts/:id', authenticate, requireAdmin, requireJson, content.updatePost);
    router.delete('/admin/posts/:id', authenticate, requireAdmin, content.deletePost);

    router.post('/admin/uploads', authenticate, requirePermission('uploads.write'), uploadImage, content.upload);

    router.get('/gallery', gallery.listPublic);
    router.get('/gallery/:id', gallery.getPublic);
    router.post('/admin/gallery/uploads', authenticate, requireAdmin, galleryUpload, gallery.upload);
    router.get('/admin/gallery', authenticate, requireAdmin, gallery.listAdmin);
    router.post('/admin/gallery', authenticate, requireAdmin, requireJson, gallery.create);
    router.get('/admin/gallery/:id', authenticate, requireAdmin, gallery.getAdmin);
    router.patch('/admin/gallery/:id', authenticate, requireAdmin, requireJson, gallery.update);
    router.delete('/admin/gallery/:id', authenticate, requireAdmin, gallery.remove);

    router.get('/admin/custom-build/setup', authenticate, requirePermission('catalog.read'), wizardSetup.list);
    router.get('/admin/custom-build/setup/:categoryId', authenticate, requirePermission('catalog.read'), wizardSetup.getCategory);
    router.post('/admin/custom-build/setup/:categoryId/options', authenticate, requirePermission('catalog.write'), requireJson, wizardSetup.createOption);
    router.patch('/admin/custom-build/setup/:categoryId/reorder', authenticate, requirePermission('catalog.write'), requireJson, wizardSetup.reorderOptions);
    router.post('/admin/custom-build/setup/:categoryId/options/:optionId/duplicate', authenticate, requirePermission('catalog.write'), wizardSetup.duplicateOption);
    router.patch('/admin/custom-build/setup/:categoryId/options/:optionId', authenticate, requirePermission('catalog.write'), requireJson, wizardSetup.updateOption);
    router.delete('/admin/custom-build/setup/:categoryId/options/:optionId', authenticate, requirePermission('catalog.delete'), wizardSetup.deleteOption);

    router.get('/custom-build/options', customBuild.listOptions);
    router.get('/custom-build/options/:categoryId', customBuild.getCategory);
    router.post('/custom-build/uploads', limitSensitive, customBuildUpload, customBuild.upload);
    router.delete('/custom-build/uploads', limitSensitive, customBuild.deleteUpload);
    router.post('/custom-build/validate', requireJson, customBuild.validate);
    router.post('/custom-build/inquiries', limitSensitive, requireJson, customBuild.createInquiry);
    router.get('/admin/custom-build/inquiries', authenticate, requirePermission('inquiries.read'), customBuild.listInquiries);
    router.get('/admin/custom-build/inquiries/:id', authenticate, requirePermission('inquiries.read'), customBuild.getInquiry);
    router.patch('/admin/custom-build/inquiries/:id', authenticate, requirePermission('inquiries.update_status'), requireJson, customBuild.updateInquiry);
    router.delete('/admin/custom-build/inquiries/:id', authenticate, requirePermission('inquiries.delete'), customBuild.deleteInquiry);

    return router;
}

module.exports = { createApiRouter };
