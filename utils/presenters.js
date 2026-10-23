const { effectivePermissions } = require('./permissions');
const { publicRole } = require('./roles');

function publicAddress(address) {
    if (!address) {
        return null;
    }
    return {
        line1: address.line1 || null,
        line2: address.line2 || null,
        city: address.city || null,
        region: address.region || null,
        postalCode: address.postalCode || null,
        country: address.country || null,
    };
}

function publicUser(user) {
    return {
        id: String(user._id),
        email: user.email,
        username: user.username || null,
        name: user.name || null,
        phone: user.phone || null,
        country: user.country || null,
        shippingAddress: publicAddress(user.shippingAddress),
        marketingConsent: user.marketingConsent === true,
        emailVerified: user.emailVerified === true,
        status: user.status === 'locked' ? 'locked' : 'active',
        userType: user.userType || null,
        role: publicRole(user),
        permissions: effectivePermissions(user),
        createdAt: user.createdAt || null,
    };
}

function inventoryStatus(qty) {
    return Number(qty) > 0 ? 'in_stock' : 'out_of_stock';
}

function publicProduct(product) {
    const quantity = Number(product.qty) || 0;
    return {
        id: String(product._id),
        code: product.code || null,
        name: product.name,
        description: product.description || null,
        descriptionDetail: product.descriptionDetail || null,
        price: product.price ?? null,
        unit: product.unit || null,
        rating: product.rating ?? null,
        brand: product.brand || null,
        type: product.type || null,
        image: product.image || null,
        images: product.images || [],
        inventory: {
            quantity,
            status: inventoryStatus(quantity),
        },
    };
}

function publicReview(review) {
    return {
        id: String(review._id),
        productId: String(review.productId),
        name: review.name,
        rating: review.rating,
        content: review.content,
        recommend: Boolean(review.recommend),
        quality: review.quality ?? null,
        shipping: review.shipping ?? null,
        service: review.service ?? null,
        createdAt: review.createdAt,
    };
}

function publicMessage(message) {
    return {
        id: String(message._id),
        name: message.name,
        email: message.email,
        phone: message.phone || null,
        subject: message.subject || null,
        message: message.message,
        inquiryType: message.inquiryType || null,
        productId: message.productId || null,
        productRef: message.productRef || null,
        draftId: message.draftId || null,
        createdAt: message.createdAt,
    };
}

function publicPost(post) {
    return {
        id: String(post._id),
        title: post.title,
        content: post.content,
        published: post.published !== false,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt || post.createdAt,
    };
}

module.exports = {
    publicMessage,
    publicPost,
    publicProduct,
    publicReview,
    publicUser,
};
