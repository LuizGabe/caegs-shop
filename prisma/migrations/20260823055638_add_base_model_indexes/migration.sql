-- CreateIndex
CREATE INDEX "Announcement_active_deletedAt_displayOrder_idx" ON "Announcement"("active", "deletedAt", "displayOrder");

-- CreateIndex
CREATE INDEX "Announcement_startsAt_endsAt_idx" ON "Announcement"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Announcement_deletedAt_idx" ON "Announcement"("deletedAt");

-- CreateIndex
CREATE INDEX "Course_deletedAt_idx" ON "Course"("deletedAt");

-- CreateIndex
CREATE INDEX "Course_canPurchase_deletedAt_idx" ON "Course"("canPurchase", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_active_deletedAt_displayOrder_idx" ON "Product"("active", "deletedAt", "displayOrder");

-- CreateIndex
CREATE INDEX "Product_featured_deletedAt_displayOrder_idx" ON "Product"("featured", "deletedAt", "displayOrder");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductImage_productId_type_deletedAt_displayOrder_idx" ON "ProductImage"("productId", "type", "deletedAt", "displayOrder");

-- CreateIndex
CREATE INDEX "ProductImage_deletedAt_idx" ON "ProductImage"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_active_deletedAt_displayOrder_idx" ON "ProductVariant"("productId", "active", "deletedAt", "displayOrder");

-- CreateIndex
CREATE INDEX "ProductVariant_deletedAt_idx" ON "ProductVariant"("deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "User_courseId_idx" ON "User"("courseId");
