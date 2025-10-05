let leftBookmarks = [];
let rightBookmarks = [];
let diffMode = false;
let currentDiffIndex = -1;
let differences = [];
let currentDropIndicator = null;
let selectedBookmark = null;
let clipboardData = null;

// 添加鼠标位置跟踪
let currentMouseX = 0;
let currentMouseY = 0;
document.addEventListener('mousemove', (e) => {
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDragAndDrop();
    setupKeyboardShortcuts();
    setupDiffCountHandlers(); // 添加统计块点击事件处理
    restoreState();
});

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+C: 复制
        if (e.ctrlKey && e.key === 'c') {
            const activeContainer = document.querySelector('.tree-container.active-container');
            if (!activeContainer) return;
            
            const selectedBookmark = activeContainer.querySelector('.bookmark.selected')?.closest('.bookmark-item');
            if (selectedBookmark) {
                copyBookmark(selectedBookmark);
                e.preventDefault();
            }
        }
        // Ctrl+V: 粘贴
        if (e.ctrlKey && e.key === 'v') {
            // 使用当前鼠标位置进行粘贴
            window.lastClickY = currentMouseY;
            // 根据鼠标位置查找容器
            const mouseX = currentMouseX;
            const mouseY = currentMouseY;
            const containers = document.querySelectorAll('.tree-container');
            let targetContainer = null;
            
            // 查找鼠标所在的容器
            containers.forEach(container => {
                const rect = container.getBoundingClientRect();
                if (mouseX >= rect.left && mouseX <= rect.right &&
                    mouseY >= rect.top && mouseY <= rect.bottom) {
                    targetContainer = container;
                }
            });
            
            // 只有当鼠标在容器内时才执行粘贴
            if (targetContainer) {
                pasteBookmark(targetContainer);
                e.preventDefault();
            } else {
                showToast('请将鼠标移动到要粘贴的书签列表中', 'warning');
            }
        }
    });
}

// 设置活动容器
function setActiveContainer(container) {
    if (!container) return;
    
    // 移除所有容器的激活状态
    document.querySelectorAll('.tree-container').forEach(c => {
        c.classList.remove('active-container');
    });
    
    // 激活目标容器
    container.classList.add('active-container');
}

// 复制书签
function copyBookmark(bookmarkItem) {
    if (!bookmarkItem) {
        showToast('请先选择要复制的书签', 'warning');
        return;
    }
    
    const container = bookmarkItem.closest('.tree-container');
    if (container) {
        setActiveContainer(container);
    }
    
    const isFolder = bookmarkItem.querySelector('.folder') !== null;
    
    if (isFolder) {
        // 复制文件夹及其所有内容
        const folderData = extractFolderData(bookmarkItem);
        if (folderData) {
            clipboardData = folderData;
            console.log('复制的文件夹数据:', clipboardData);
            showToast('已复制文件夹');
        }
    } else {
        // 复制单个书签
        const bookmarkData = extractBookmarkData(bookmarkItem);
        if (bookmarkData) {
            clipboardData = bookmarkData;
            console.log('复制的书签数据:', clipboardData);
            showToast('已复制书签');
        }
    }
}

// 提取文件夹数据
function extractFolderData(folderItem) {
    const folderTitle = folderItem.querySelector('.folder-title');
    if (!folderTitle) return null;

    const children = [];
    const folderChildren = folderItem.querySelector('.folder-children');
    
    if (folderChildren) {
        // 遍历所有子项
        const childItems = folderChildren.querySelectorAll(':scope > .bookmark-item');
        childItems.forEach(childItem => {
            if (childItem.querySelector('.folder')) {
                // 递归提取子文件夹
                const subFolderData = extractFolderData(childItem);
                if (subFolderData) {
                    children.push(subFolderData);
                }
            } else {
                // 提取子书签
                const bookmarkData = extractBookmarkData(childItem);
                if (bookmarkData) {
                    children.push(bookmarkData);
                }
            }
        });
    }

    return {
        title: folderTitle.textContent.replace(/\(\d+\)$/, '').trim(),
        isFolder: true,
        children: children,
        path: folderItem.dataset.path
    };
}

// 粘贴书签
function pasteBookmark(targetContainer, targetBookmarkItem = null) {
    console.log('开始粘贴书签...');
    console.log('剪贴板数据:', clipboardData);

    if (!clipboardData || !clipboardData.title) {
        console.warn('剪贴板数据无效:', clipboardData);
        showToast('剪贴板为空或数据无效', 'warning');
        return;
    }

    // 如果没有指定目标容器，根据鼠标位置确定
    if (!targetContainer) {
        const mouseX = currentMouseX;
        const mouseY = currentMouseY;
        
        // 获取所有容器
        const containers = document.querySelectorAll('.tree-container');
        let foundContainer = null;
        
        // 查找鼠标所在的容器
        containers.forEach(container => {
            const rect = container.getBoundingClientRect();
            if (mouseX >= rect.left && mouseX <= rect.right &&
                mouseY >= rect.top && mouseY <= rect.bottom) {
                foundContainer = container;
            }
        });
        
        // 如果找到鼠标所在的容器，使用它
        if (foundContainer) {
            targetContainer = foundContainer;
        } else {
            // 如果没有找到，使用当前激活的容器
            targetContainer = document.querySelector('.tree-container.active-container');
        }
        
        if (!targetContainer) {
            console.warn('未找到目标容器');
            showToast('请先选择要粘贴到的位置', 'warning');
            return;
        }
    }

    // 激活目标容器
    setActiveContainer(targetContainer);
    console.log('目标容器:', targetContainer.id);

    const bookmarkTree = targetContainer.querySelector('.bookmark-tree');
    if (!bookmarkTree) {
        console.warn('未找到书签树');
        return;
    }

    // 获取鼠标位置
    const mouseY = currentMouseY;
    console.log('当前鼠标Y坐标:', mouseY);

    // 找到最接近鼠标位置的可见书签项
    let closestItem = null;
    let minDistance = Infinity;
    let shouldInsertAfter = false;

    // 获取所有可见的书签项
    const visibleItems = Array.from(bookmarkTree.querySelectorAll('.bookmark-item')).filter(item => {
        const rect = item.getBoundingClientRect();
        return rect.height > 0; // 只考虑可见的元素
    });

    visibleItems.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemTop = rect.top;
        const itemBottom = rect.bottom;
        const itemCenter = (itemTop + itemBottom) / 2;
        
        // 计算鼠标到元素中心的距离
        const distance = Math.abs(mouseY - itemCenter);
        
        // 如果这个元素是最近的
        if (distance < minDistance) {
            minDistance = distance;
            closestItem = item;
            // 判断是否应该插入到元素后面
            shouldInsertAfter = mouseY > itemCenter;
        }
    });

    // 创建新元素
    const newItem = clipboardData.isFolder ? 
        createFolderElement(clipboardData) : 
        createBookmarkElement(clipboardData);

    let insertedItem = null; // 用于跟踪插入的元素

    // 确定插入位置
    let insertTarget = closestItem;
    if (insertTarget) {
        // 如果目标是折叠的文件夹，并且鼠标在其下半部分，尝试插入到文件夹内
        const isFolder = insertTarget.querySelector('.folder') !== null;
        const isExpanded = insertTarget.classList.contains('expanded');
        
        if (isFolder && shouldInsertAfter && !isExpanded) {
            // 在文件夹后面插入
            insertedItem = insertTarget.parentNode.insertBefore(newItem, insertTarget.nextSibling);
        } else if (isFolder && shouldInsertAfter && isExpanded) {
            // 在展开的文件夹内部的最前面插入
            const folderChildren = insertTarget.querySelector('.folder-children');
            if (folderChildren) {
                insertedItem = folderChildren.insertBefore(newItem, folderChildren.firstChild);
            } else {
                insertedItem = insertTarget.parentNode.insertBefore(newItem, insertTarget.nextSibling);
            }
        } else {
            // 普通的前后插入
            insertedItem = insertTarget.parentNode.insertBefore(newItem, shouldInsertAfter ? insertTarget.nextSibling : insertTarget);
        }
    } else {
        // 如果没有找到合适的位置，添加到末尾
        insertedItem = bookmarkTree.appendChild(newItem);
    }
    
    // 更新书签数组
    console.log('更新书签数组...');
    updateBookmarkArrays();
    
    // 重新初始化拖拽功能
    setupDragAndDrop();

    // 高亮并滚动到新插入的元素
    if (insertedItem) {
        // 移除其他元素的选中状态
        document.querySelectorAll('.bookmark.selected, .folder.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // 添加选中状态和动画效果
        const targetElement = clipboardData.isFolder ? 
            insertedItem.querySelector('.folder') : 
            insertedItem.querySelector('.bookmark');

        if (targetElement) {
            targetElement.classList.add('selected');
            insertedItem.classList.add('current-diff');

            // 确保父文件夹是展开的
            let parent = insertedItem.parentElement;
            while (parent) {
                if (parent.classList.contains('folder-children')) {
                    parent.style.display = 'block';
                    const folderItem = parent.parentElement;
                    if (folderItem) {
                        folderItem.classList.add('expanded');
                        const expandIcon = folderItem.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.style.transform = 'rotate(90deg)';
                        }
                        const folderIcon = folderItem.querySelector('.folder-icon');
                        if (folderIcon) {
                            folderIcon.textContent = '📂';
                        }
                    }
                }
                parent = parent.parentElement;
            }

            // 平滑滚动到插入的元素
            setTimeout(() => {
                const containerRect = targetContainer.getBoundingClientRect();
                const itemRect = insertedItem.getBoundingClientRect();
                const scrollTop = targetContainer.scrollTop + (itemRect.top - containerRect.top) - (containerRect.height / 2) + (itemRect.height / 2);

                targetContainer.scrollTo({
                    top: scrollTop,
                    behavior: 'smooth'
                });

                // 移除动画效果
                setTimeout(() => {
                    insertedItem.classList.remove('current-diff');
                }, 2000);
            }, 100);
        }
    }
    
    // 显示成功提示
    const itemType = clipboardData.isFolder ? '文件夹' : '书签';
    const itemTitle = clipboardData.title;
    showToast(`已粘贴${itemType}：${itemTitle}`);
    console.log('粘贴操作完成');
}

// 创建文件夹元素
function createFolderElement(folderData, level = 0) {
    console.log('创建文件夹元素:', folderData.title);
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.level = level;
    item.draggable = true;

    // 创建文件夹头部
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder';

    // 添加展开/折叠图标
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = '▶';
    expandIcon.style.marginRight = '8px';
    expandIcon.style.display = 'inline-block';
    expandIcon.style.transition = 'transform 0.2s';
    folderDiv.appendChild(expandIcon);

    // 添加文件夹图标
    const folderIcon = document.createElement('span');
    folderIcon.className = 'folder-icon';
    folderIcon.textContent = '📁';
    folderIcon.style.marginRight = '8px';
    folderDiv.appendChild(folderIcon);

    // 添加文件夹标题
    const titleSpan = document.createElement('span');
    titleSpan.className = 'folder-title';
    titleSpan.textContent = folderData.title;
    folderDiv.appendChild(titleSpan);

    // 创建子项容器
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'folder-children';
    childrenDiv.style.display = 'none';

    // 添加点击事件
    folderDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = item.classList.toggle('expanded');
        expandIcon.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0)';
        childrenDiv.style.display = isExpanded ? 'block' : 'none';
        folderIcon.textContent = isExpanded ? '📂' : '📁';
    });

    // 添加拖拽事件
    item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        item.classList.add('dragging');
        const data = extractFolderData(item);
        e.dataTransfer.setData('text/plain', JSON.stringify(data));
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
    });

    // 递归添加子项
    if (folderData.children && folderData.children.length > 0) {
        folderData.children.forEach(child => {
            const childElement = child.isFolder ? 
                createFolderElement(child, level + 1) : 
                createBookmarkElement(child, level + 1);
            childrenDiv.appendChild(childElement);
        });

        // 添加子项数量提示
        const countSpan = document.createElement('span');
        countSpan.className = 'folder-count';
        countSpan.textContent = `(${folderData.children.length})`;
        countSpan.style.marginLeft = '8px';
        countSpan.style.color = 'var(--text-secondary)';
        countSpan.style.fontSize = '12px';
        titleSpan.appendChild(countSpan);
    }

    item.appendChild(folderDiv);
    item.appendChild(childrenDiv);
    return item;
}

// 添加鼠标点击位置记录
document.addEventListener('click', (e) => {
    window.lastClickY = e.clientY;
});

// 提取书签数据
function extractBookmarkData(bookmarkItem) {
    const bookmark = bookmarkItem.querySelector('.bookmark');
    if (!bookmark) return null;

    const titleElement = bookmark.querySelector('.bookmark-title');
    if (!titleElement) return null;

    const iconElement = bookmark.querySelector('img');
    return {
        title: titleElement.textContent,
        url: titleElement.dataset.url,
        icon: iconElement ? iconElement.src : '',
        isFolder: false,
        path: getBookmarkPath(bookmarkItem)
    };
}

// 创建书签元素
function createBookmarkElement(bookmarkData, level = 0) {
    const bookmarkItem = document.createElement('div');
    bookmarkItem.className = 'bookmark-item';
    bookmarkItem.dataset.level = level;
    bookmarkItem.draggable = true;

    // 创建书签内容
    const bookmarkDiv = document.createElement('div');
    bookmarkDiv.className = 'bookmark';

    // 添加图标
    const icon = document.createElement('img');
    icon.src = bookmarkData.icon || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB7SURBVDiN7ZOxCsAgDESv1q8X3Pz/L3Hu4Jx2cxEqpWIphC4ZQnKPkAjgH2DmA7xnf4ByzgB6Uv0WyzkHAFprj7YQAmKMmVJKAPuqXGsF5+xMIdWc8zR3EQFVxbZtQ+GUkpl5zBTLWgtmxrquQ+GUEkII771/+xd3XgBk5V/sxhXz1QAAAABJRU5ErkJggg==';
    icon.width = 16;
    icon.height = 16;
    icon.style.marginRight = '8px';
    bookmarkDiv.appendChild(icon);

    // 添加标题
    const title = document.createElement('span');
    title.className = 'bookmark-title';
    title.textContent = bookmarkData.title;
    title.dataset.url = bookmarkData.url || '';
    bookmarkDiv.appendChild(title);

    // 添加点击事件
    bookmarkDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.bookmark.selected').forEach(el => {
            el.classList.remove('selected');
        });
        bookmarkDiv.classList.add('selected');
    });

    // 添加拖拽事件
    bookmarkItem.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        bookmarkItem.classList.add('dragging');
        const data = extractBookmarkData(bookmarkItem);
        e.dataTransfer.setData('text/plain', JSON.stringify(data));
    });

    bookmarkItem.addEventListener('dragend', () => {
        bookmarkItem.classList.remove('dragging');
    });

    bookmarkItem.appendChild(bookmarkDiv);
    return bookmarkItem;
}

// 设置拖拽事件
function setupDragAndDrop() {
    const containers = document.querySelectorAll('.tree-container');
    containers.forEach(container => {
        container.addEventListener('dragstart', handleDragStart);
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragleave', handleDragLeave);
    });
}

// 处理拖拽开始
function handleDragStart(e) {
    const bookmarkItem = e.target.closest('.bookmark-item');
    if (!bookmarkItem) return;

    e.dataTransfer.setData('text/plain', JSON.stringify(extractBookmarkData(bookmarkItem)));
    e.dataTransfer.effectAllowed = 'copy';
}

// 处理拖拽结束
function handleDrop(e) {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;

    try {
        const bookmarkData = JSON.parse(data);
        const newBookmark = createBookmarkElement(bookmarkData);
        
        // 获取放置位置
        const dropTarget = e.target.closest('.bookmark-item') || e.target.closest('.tree-container');
        if (dropTarget) {
            if (dropTarget.classList.contains('tree-container')) {
                dropTarget.appendChild(newBookmark);
            } else {
                dropTarget.parentNode.insertBefore(newBookmark, dropTarget.nextSibling);
            }
        }

        updateBookmarkArrays();
        showToast('已复制书签');
    } catch (error) {
        console.error('拖放处理错误:', error);
    }

    // 清除拖放指示器
    if (currentDropIndicator) {
        currentDropIndicator.remove();
        currentDropIndicator = null;
    }
}

// 处理右键菜单点击
function handleMenuItemClick(e) {
    const action = e.currentTarget.dataset.action;
    const menu = e.currentTarget.closest('.context-menu');
    const targetId = menu.dataset.targetBookmarkItem;
    const targetContainer = menu.dataset.targetContainer;
    const bookmarkItem = targetId ? document.getElementById(targetId) : null;
    const container = targetContainer ? document.getElementById(targetContainer) : null;
    
    switch (action) {
        case 'newFolder':
            createNewFolder(container || bookmarkItem?.closest('.tree-container'));
            break;
            
        case 'copy':
            if (bookmarkItem) {
                copyBookmark(bookmarkItem);
            }
            break;
            
        case 'paste':
            const targetElement = container || bookmarkItem?.closest('.tree-container');
            if (targetElement) {
                pasteBookmark(targetElement, bookmarkItem);
            }
            break;
            
        case 'edit':
            showEditDialog(bookmarkItem);
            break;
            
        case 'delete':
            if (confirm('确定要删除这个' + (bookmarkItem?.querySelector('.folder') ? '文件夹' : '书签') + '吗？')) {
                bookmarkItem?.remove();
                updateBookmarkArrays();
                showToast('删除成功');
            }
            break;
            
        case 'expandAll':
            const folderToExpand = bookmarkItem?.querySelector('.folder');
            if (folderToExpand) {
                expandAllSubFolders(bookmarkItem);
                showToast('已展开所有子文件夹');
            }
            break;
            
        case 'collapseAll':
            const folderToCollapse = bookmarkItem?.querySelector('.folder');
            if (folderToCollapse) {
                collapseAllSubFolders(bookmarkItem);
                showToast('已折叠所有子文件夹');
            }
            break;
            
        case 'jumpOtherSide':
            if (bookmarkItem) {
                const originContainer = bookmarkItem.closest('.tree-container');
                const isLeft = originContainer?.id === 'leftBookmarks';
                jumpToOtherSide(bookmarkItem, isLeft);
            } else {
                showToast('请在具体项目上使用该功能', 'warning');
            }
            break;

        case 'copyUrl':
            const bookmarkTitle = bookmarkItem?.querySelector('.bookmark-title');
            if (bookmarkTitle) {
                const url = bookmarkTitle.dataset.url;
                if (url) {
                    navigator.clipboard.writeText(url)
                        .then(() => showToast('链接已复制到剪贴板'))
                        .catch(() => showToast('复制失败'));
                }
            }
            break;
            
        case 'copyTitle':
            const titleElement = bookmarkItem?.querySelector('.bookmark-title');
            if (titleElement) {
                const title = titleElement.textContent;
                if (title) {
                    navigator.clipboard.writeText(title)
                        .then(() => showToast('标题已复制到剪贴板'))
                        .catch(() => showToast('复制失败'));
                }
            }
            break;
    }
    
    hideContextMenu();
}

// 处理书签点击事件
function handleBookmarkClick(e) {
    const container = e.target.closest('.tree-container');
    if (!container) return;

    // 激活当前容器
    setActiveContainer(container);
}

// 保存当前状态到本地存储
function saveState() {
    const state = {
        leftBookmarks,
        rightBookmarks,
        diffMode,
        currentDiffIndex,
        differences
    };
    localStorage.setItem('bookmarkManagerState', JSON.stringify(state));
}

// 从本地存储恢复状态
function restoreState() {
    const savedState = localStorage.getItem('bookmarkManagerState');
    if (savedState) {
        const state = JSON.parse(savedState);
        leftBookmarks = state.leftBookmarks || [];
        rightBookmarks = state.rightBookmarks || [];
        diffMode = state.diffMode || false;
        currentDiffIndex = state.currentDiffIndex || -1;
        differences = state.differences || [];

        // 重新渲染书签树
        if (leftBookmarks.length > 0) {
            renderBookmarkTree('leftBookmarks', leftBookmarks);
        }
        if (rightBookmarks.length > 0) {
            renderBookmarkTree('rightBookmarks', rightBookmarks);
        }

        // 如果两侧都有书签，自动进入差异模式并标记差异
        if (leftBookmarks.length > 0 && rightBookmarks.length > 0) {
            diffMode = true;
            differences = compareTrees();
            if (differences && differences.length > 0) {
                markDifferences(false);
                document.getElementById('diffFunctionPanel').style.display = 'flex';
                showToast(`发现 ${differences.length} 处差异`, 'success', true);
            }
        }
    }
}

// 重置所有状态
function resetState() {
    leftBookmarks = [];
    rightBookmarks = [];
    diffMode = false;
    currentDiffIndex = -1;
    differences = [];
    
    // 清空书签树
    document.getElementById('leftBookmarks').innerHTML = '';
    document.getElementById('rightBookmarks').innerHTML = '';
    
    // 隐藏差异面板和功能按钮
    document.getElementById('diffPanel').style.display = 'none';
    document.getElementById('diffFunctionPanel').style.display = 'none';
    
    // 清除本地存储
    localStorage.removeItem('bookmarkManagerState');
    
    // 清空文件输入
    document.getElementById('leftImportFile').value = '';
    document.getElementById('rightImportFile').value = '';
    
    showToast('已重置所有数据');
}

// 设置事件监听器
function setupEventListeners() {
    console.log('设置事件监听器...');
    
    // 导入文件按钮事件
    document.getElementById('leftImportBtn').addEventListener('click', () => {
        document.getElementById('leftImportFile').click();
    });
    document.getElementById('rightImportBtn').addEventListener('click', () => {
        document.getElementById('rightImportFile').click();
    });

    // 文件导入事件
    document.getElementById('leftImportFile').addEventListener('change', (e) => handleFileImport(e, 'left'));
    document.getElementById('rightImportFile').addEventListener('change', (e) => handleFileImport(e, 'right'));
    
    // 修改容器点击事件 - 使用捕获阶段以确保最先处理
    document.querySelectorAll('.tree-container').forEach(container => {
        container.addEventListener('click', (e) => {
            const container = e.currentTarget;
            setActiveContainer(container);
        }, true);
    });
    
    // 实时搜索事件
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            handleSearch();
        }, 300);
    });
    
    // 差异对比相关事件
    document.getElementById('compareBtn').addEventListener('click', () => {
        console.log('点击对比差异按钮');
        diffMode = true;
        const diffs = compareTrees();
        const diffPanel = document.getElementById('diffPanel');
        
        if (diffs && diffs.length > 0) {
            console.log('找到差异，显示面板');
            diffPanel.style.display = 'block';
            diffPanel.classList.remove('fade-out');
            diffPanel.classList.add('fade-in');
            
            markDifferences(false);
            showToast(`发现 ${diffs.length} 处差异`, 'success', true);
        } else {
            console.log('未找到差异');
            showToast('未发现差异');
        }
    });
    
    // 导航按钮事件
    document.getElementById('prevDiff').addEventListener('click', navigateToPrevDiff);
    document.getElementById('nextDiff').addEventListener('click', navigateToNextDiff);
    
    // 关闭差异面板事件
    document.getElementById('closeDiffBtn').addEventListener('click', () => {
        console.log('点击关闭按钮');
        const diffPanel = document.getElementById('diffPanel');
        
        diffPanel.classList.remove('fade-in');
        diffPanel.classList.add('fade-out');
        
        setTimeout(() => {
            diffPanel.style.display = 'none';
        }, 300);
    });

    // 修改点击事件监听器，使用 mousedown 事件替代 click
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
    
    // 添加右键菜单事件
    document.addEventListener('contextmenu', handleContextMenu);
    
    // 添加右键菜单项点击事件
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', handleMenuItemClick);
    });
    
    // 添加重置按钮事件
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('确定要清空所有数据吗？此操作不可恢复。')) {
            resetState();
        }
    });
    
    console.log('事件监听器设置完成');
}

// 修改搜索处理函数
function handleSearch() {
    console.log('执行搜索');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';

    // 如果搜索词为空，清空结果
    if (!searchTerm) {
        console.log('搜索词为空，清空结果');
        return;
    }

    function searchBookmarks(bookmarks, source) {
        const results = [];
        function traverse(node, path = []) {
            if (node.url && (
                node.title.toLowerCase().includes(searchTerm) ||
                node.url.toLowerCase().includes(searchTerm)
            )) {
                results.push({ 
                    ...node, 
                    source,
                    path: path.join(' > ')
                });
            }
            if (node.children) {
                node.children.forEach(child => {
                    traverse(child, [...path, node.title || '根目录']);
                });
            }
        }
        bookmarks.forEach(item => traverse(item));
        return results;
    }

    console.log('开始搜索书签');
    const leftResults = searchBookmarks(leftBookmarks, '左侧');
    const rightResults = searchBookmarks(rightBookmarks, '右侧');
    const allResults = [...leftResults, ...rightResults];
    console.log(`找到 ${allResults.length} 个结果`);

    if (allResults.length === 0) {
        const noResult = document.createElement('div');
        noResult.className = 'no-result';
        noResult.textContent = '未找到匹配的书签';
        searchResults.appendChild(noResult);
        return;
    }

    allResults.forEach(result => {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.draggable = false;
        div.innerHTML = `
            <div class="bookmark" draggable="false">
                <img src="${result.icon || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB7SURBVDiN7ZOxCsAgDESv1q8X3Pz/L3Hu4Jx2cxEqpWIphC4ZQnKPkAjgH2DmA7xnf4ByzgB6Uv0WyzkHAFprj7YQAmKMmVJKAPuqXGsF5+xMIdWc8zR3EQFVxbZtQ+GUkpl5zBTLWgtmxrquQ+GUEkII771/+xd3XgBk5V/sxhXz1QAAAABJRU5ErkJggg=='}">
                <div class="search-result-content">
                    <div class="bookmark-title" title="${result.title}">${result.title}</div>
                    <div class="search-result-path">${result.path}</div>
                    <div class="search-result-source">${result.source}</div>
                </div>
            </div>
        `;

        // 修改点击事件处理
        div.addEventListener('click', () => {
            console.log('点击搜索结果:', result);
            const container = document.getElementById(result.source === '左侧' ? 'leftBookmarks' : 'rightBookmarks');
            
            // 先展开所有父文件夹
            const pathParts = result.path.split(' > ');
            let currentPath = '';
            
            // 展开每一级文件夹
            for (let i = 0; i < pathParts.length; i++) {
                currentPath = currentPath ? currentPath + ' > ' + pathParts[i] : pathParts[i];
                const items = container.querySelectorAll('.bookmark-item');
                items.forEach(item => {
                    const folderTitle = item.querySelector('.folder-title');
                    if (folderTitle && folderTitle.textContent.replace(/\(\d+\)$/, '').trim() === pathParts[i]) {
                        const folderChildren = item.querySelector('.folder-children');
                        if (folderChildren) {
                            folderChildren.style.display = 'block';
                            item.classList.add('expanded');
                            const expandIcon = item.querySelector('.expand-icon');
                            if (expandIcon) {
                                expandIcon.style.transform = 'rotate(90deg)';
                            }
                            const folderIcon = item.querySelector('.folder-icon');
                            if (folderIcon) {
                                folderIcon.textContent = '📂';
                            }
                        }
                    }
                });
            }
            
            // 等待文件夹展开后再查找并滚动到目标书签
            setTimeout(() => {
                const items = container.querySelectorAll('.bookmark-item');
                items.forEach(item => {
                    const bookmarkTitle = item.querySelector('.bookmark-title');
                    if (bookmarkTitle && bookmarkTitle.textContent === result.title) {
                        // 移除其他书签的高亮
                        document.querySelectorAll('.bookmark.selected').forEach(el => {
                            el.classList.remove('selected');
                        });
                        
                        // 高亮当前书签
                        const bookmark = item.querySelector('.bookmark');
                        if (bookmark) {
                            bookmark.classList.add('selected');
                            
                            // 计算滚动位置
                            const containerRect = container.getBoundingClientRect();
                            const bookmarkRect = item.getBoundingClientRect();
                            const scrollTop = container.scrollTop + (bookmarkRect.top - containerRect.top) - (containerRect.height / 2) + (bookmarkRect.height / 2);
                            
                            // 平滑滚动到目标位置
                            container.scrollTo({
                                top: scrollTop,
                                behavior: 'smooth'
                            });
                            
                            // 添加临时动画效果
                            item.classList.add('current-diff');
                            setTimeout(() => {
                                item.classList.remove('current-diff');
                            }, 2000);
                        }
                    }
                });
            }, 100);
        });

        searchResults.appendChild(div);
    });
}

// 展开到指定路径的函数
function expandToPath(container, fullPath, targetTitle) {
    console.log('展开路径:', fullPath);
    console.log('目标书签:', targetTitle);
    
    const pathParts = fullPath.split(' > ');
    let currentPath = '';
    
    // 检查当前是否已经在目标位置
    const currentSelected = container.querySelector('.bookmark.selected');
    if (currentSelected) {
        const currentTitle = currentSelected.querySelector('.bookmark-title')?.textContent;
        const currentItem = currentSelected.closest('.bookmark-item');
        if (currentTitle === targetTitle) {
            // 构建当前书签的路径
            const currentItemPath = [];
            let parent = currentItem;
            while (parent && !parent.classList.contains('tree-container')) {
                const folderTitle = parent.querySelector('.folder-title');
                if (folderTitle) {
                    currentItemPath.unshift(folderTitle.textContent.replace(/\(\d+\)$/, '').trim());
                }
                parent = parent.parentElement.closest('.bookmark-item');
            }
            
            // 如果路径也匹配，说明已经在目标位置，不需要滚动
            if (currentItemPath.join(' > ') === pathParts.slice(0, -1).join(' > ')) {
                console.log('已经在目标位置，无需滚动');
                return;
            }
        }
    }
    
    // 展开每一级文件夹
    let foldersToExpand = [];
    for (let i = 0; i < pathParts.length; i++) {
        currentPath = currentPath ? currentPath + ' > ' + pathParts[i] : pathParts[i];
        console.log('处理路径:', currentPath);
        
        // 查找当前路径的文件夹
        const items = container.querySelectorAll('.bookmark-item');
        items.forEach(item => {
            const folderTitle = item.querySelector('.folder-title');
            if (folderTitle && folderTitle.textContent.replace(/\(\d+\)$/, '').trim() === pathParts[i]) {
                foldersToExpand.push(item);
            }
        });
    }

    // 按顺序展开文件夹
    foldersToExpand.forEach(item => {
        const folderChildren = item.querySelector('.folder-children');
        if (folderChildren) {
            console.log('展开文件夹:', item.querySelector('.folder-title').textContent);
            folderChildren.style.display = 'block';
            item.classList.add('expanded');
            
            const expandIcon = item.querySelector('.expand-icon');
            if (expandIcon) {
                expandIcon.style.transform = 'rotate(90deg)';
            }
            
            const folderIcon = item.querySelector('.folder-icon');
            if (folderIcon) {
                folderIcon.textContent = '📂';
            }
        }
    });
    
    // 等待所有文件夹展开后再查找并滚动到目标书签
    setTimeout(() => {
        let targetBookmark = null;
        const items = container.querySelectorAll('.bookmark-item');
        
        items.forEach(item => {
            const bookmarkTitle = item.querySelector('.bookmark-title');
            if (bookmarkTitle && bookmarkTitle.textContent === targetTitle) {
                // 检查是否在正确的路径上
                const itemPath = [];
                let parent = item;
                while (parent && !parent.classList.contains('tree-container')) {
                    const folderTitle = parent.querySelector('.folder-title');
                    if (folderTitle) {
                        itemPath.unshift(folderTitle.textContent.replace(/\(\d+\)$/, '').trim());
                    }
                    parent = parent.parentElement.closest('.bookmark-item');
                }
                
                const itemPathStr = itemPath.join(' > ');
                const targetPathStr = pathParts.slice(0, -1).join(' > ');
                
                if (itemPathStr === targetPathStr) {
                    targetBookmark = item;
                }
            }
        });
        
        if (targetBookmark) {
            // 移除其他书签的高亮
            document.querySelectorAll('.bookmark.selected').forEach(el => {
                el.classList.remove('selected');
            });
            
            // 高亮当前书签
            const bookmark = targetBookmark.querySelector('.bookmark');
            if (bookmark) {
                bookmark.classList.add('selected');
                
                // 确保父容器可见
                let parent = targetBookmark.parentElement;
                while (parent && !parent.classList.contains('tree-container')) {
                    if (parent.classList.contains('folder-children')) {
                        parent.style.display = 'block';
                    }
                    parent = parent.parentElement;
                }
                
                // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
                requestAnimationFrame(() => {
                    // 计算滚动位置
                    const containerRect = container.getBoundingClientRect();
                    const bookmarkRect = targetBookmark.getBoundingClientRect();
                    const scrollTop = container.scrollTop + (bookmarkRect.top - containerRect.top) - (containerRect.height / 2) + (bookmarkRect.height / 2);
                    
                    // 平滑滚动到目标位置
                    container.scrollTo({
                        top: scrollTop,
                        behavior: 'smooth'
                    });
                    
                    // 添加临时动画效果
                    targetBookmark.classList.add('current-diff');
                    setTimeout(() => {
                        targetBookmark.classList.remove('current-diff');
                    }, 2000);
                });
            }
        }
    }, 300); // 增加延迟时间，确保文件夹展开动画完成
}

// 基础的书签跳转函数
function navigateToBookmarkBase(container, title, path, options = {}) {
    console.log('基础书签跳转:', title);
    console.log('目标路径:', path);
    
    if (!container || !title) {
        console.warn('缺少必要参数');
        return false;
    }

    const bookmarkItems = container.querySelectorAll('.bookmark-item');
    let found = false;

    bookmarkItems.forEach(item => {
        const bookmarkTitle = item.querySelector('.bookmark-title');
        if (bookmarkTitle && bookmarkTitle.textContent === title) {
            // 检查路径是否匹配
            if (path) {
                const itemPath = getBookmarkPath(item);
                const itemPathStr = itemPath.join(' > ');
                const targetPathStr = path.split(' > ').slice(0, -1).join(' > ');
                if (itemPathStr !== targetPathStr) {
                    return;
                }
            }

            // 展开所有父文件夹
            let parent = item.parentElement;
            while (parent) {
                if (parent.classList.contains('folder-children')) {
                    parent.style.display = 'block';
                    const folderItem = parent.parentElement;
                    if (folderItem) {
                        folderItem.classList.add('expanded');
                        const expandIcon = folderItem.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.style.transform = 'rotate(90deg)';
                        }
                        const folderIcon = folderItem.querySelector('.folder-icon');
                        if (folderIcon) {
                            folderIcon.textContent = '📂';
                        }
                    }
                }
                parent = parent.parentElement;
            }

            // 移除其他书签的选中状态
            if (options.clearSelection !== false) {
                document.querySelectorAll('.bookmark.selected').forEach(el => {
                    el.classList.remove('selected');
                });
            }

            // 高亮当前书签
            const bookmark = item.querySelector('.bookmark');
            if (bookmark) {
                bookmark.classList.add('selected');
            }

            // 滚动到视图
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 添加临时动画效果
            item.classList.add('current-diff');
            setTimeout(() => {
                item.classList.remove('current-diff');
            }, options.animationDuration || 2000);

            found = true;
        }
    });

    return found;
}

// 修改 navigateToBookmark 函数
function navigateToBookmark(container, title, path) {
    return navigateToBookmarkBase(container, title, path);
}

// 修改 jumpToOtherSide 函数
function jumpToOtherSide(bookmarkItem, isLeftContainer) {
    if (!bookmarkItem) {
        showToast('无法定位跳转目标', 'warning');
        return;
    }

    const targetContainerId = isLeftContainer ? 'rightBookmarks' : 'leftBookmarks';
    const targetContainer = document.getElementById(targetContainerId);
    if (!targetContainer) {
        console.warn('未找到目标面板:', targetContainerId);
        showToast('未找到另一侧的书签面板', 'warning');
        return;
    }

    const meta = collectBookmarkMeta(bookmarkItem);
    if (!meta) {
        console.warn('无法提取当前节点的元数据');
        showToast('无法解析当前项目，无法跳转', 'warning');
        return;
    }

    const counterpart = findCounterpartInContainer(targetContainer, meta);

    if (counterpart) {
        setActiveContainer(targetContainer);
        focusOnBookmarkItem(counterpart);
        showToast('已跳转到另一侧的对应项目');
        return;
    }

    const siblingFallback = findNearestSiblingInSameFolder(targetContainer, meta);
    if (siblingFallback) {
        setActiveContainer(targetContainer);
        focusOnBookmarkItem(siblingFallback);
        showToast('未找到完全匹配，已定位到同文件夹的相邻项目', 'warning');
        return;
    }

    if (scrollToRelativePosition(bookmarkItem, targetContainer)) {
        setActiveContainer(targetContainer);
        showToast('未找到完全匹配，已定位到大致位置', 'warning');
    } else {
        showToast('另一侧没有可跳转的项目', 'warning');
    }
}

function collectBookmarkMeta(bookmarkItem) {
    const path = getBookmarkPath(bookmarkItem);
    if (!path.length) {
        return null;
    }

    const isFolder = bookmarkItem.querySelector('.folder') !== null;
    if (isFolder) {
        const titleElement = bookmarkItem.querySelector('.folder-title');
        if (!titleElement) {
            return null;
        }

        return {
            isFolder: true,
            title: normalizeTitle(titleElement.textContent),
            path
        };
    }

    const titleElement = bookmarkItem.querySelector('.bookmark-title');
    if (!titleElement) {
        return null;
    }

    return {
        isFolder: false,
        title: normalizeTitle(titleElement.textContent),
        url: titleElement.dataset?.url || '',
        path
    };
}

function normalizeTitle(text) {
    return (text || '').replace(/\(\d+\)$/, '').trim();
}

function findCounterpartInContainer(container, meta) {
    const items = Array.from(container.querySelectorAll('.bookmark-item'));
    if (!items.length) {
        return null;
    }

    const sameTypeItems = items.filter(item => {
        const isFolder = item.querySelector('.folder') !== null;
        return isFolder === meta.isFolder;
    });

    if (!sameTypeItems.length) {
        return null;
    }

    const exactPathItem = sameTypeItems.find(item => arraysEqual(getBookmarkPath(item), meta.path));
    if (exactPathItem) {
        return exactPathItem;
    }

    if (!meta.isFolder && meta.url) {
        const urlMatches = sameTypeItems.filter(item => {
            const titleElement = item.querySelector('.bookmark-title');
            return titleElement && (titleElement.dataset?.url || '') === meta.url;
        });

        if (urlMatches.length === 1) {
            return urlMatches[0];
        }

        if (urlMatches.length > 1) {
            const bestUrlMatch = pickBestCounterpart(urlMatches, meta);
            if (bestUrlMatch) {
                return bestUrlMatch;
            }
        }
    }

    return pickBestCounterpart(sameTypeItems, meta);
}

function findNearestSiblingInSameFolder(container, meta) {
    const parentPath = meta.path.slice(0, -1);
    let siblingItems = [];

    if (parentPath.length === 0) {
        siblingItems = Array.from(container.children).filter(child => child.classList && child.classList.contains('bookmark-item'));
    } else {
        const folderCandidates = Array.from(container.querySelectorAll('.bookmark-item')).filter(item => item.querySelector('.folder') !== null);
        const parentFolder = folderCandidates.find(item => arraysEqual(getBookmarkPath(item), parentPath));
        if (parentFolder) {
            const childrenContainer = parentFolder.querySelector('.folder-children');
            if (childrenContainer) {
                siblingItems = Array.from(childrenContainer.children).filter(child => child.classList && child.classList.contains('bookmark-item'));
            }
        }
    }

    if (!siblingItems.length) {
        return null;
    }

    const sameTypeSiblings = siblingItems.filter(item => {
        const isFolder = item.querySelector('.folder') !== null;
        return isFolder === meta.isFolder;
    });

    const candidates = sameTypeSiblings.length ? sameTypeSiblings : siblingItems;
    return pickBestCounterpart(candidates, meta, 0);
}


function pickBestCounterpart(items, meta, minScore = 30) {
    let bestItem = null;
    let bestScore = -1;

    items.forEach(item => {
        const path = getBookmarkPath(item);
        const titleElement = meta.isFolder ?
            item.querySelector('.folder-title') :
            item.querySelector('.bookmark-title');

        if (!titleElement) {
            return;
        }

        const candidateTitle = normalizeTitle(titleElement.textContent);
        let score = 0;

        if (!meta.isFolder) {
            const candidateUrl = titleElement.dataset?.url || '';
            if (meta.url && candidateUrl === meta.url) {
                score += 80;
            }
        }

        if (candidateTitle === meta.title) {
            score += 30;
        }

        const commonPrefix = getCommonPathPrefixLength(path, meta.path);
        score += commonPrefix * 5;

        if (arraysEqual(path, meta.path)) {
            score += 200;
        } else if (path.length === meta.path.length) {
            score += 5;
        }

        if (score > bestScore) {
            bestScore = score;
            bestItem = item;
        }
    });

    return bestScore >= minScore ? bestItem : null;
}

function getCommonPathPrefixLength(a, b) {
    const length = Math.min(a.length, b.length);
    let count = 0;
    for (let i = 0; i < length; i++) {
        if (a[i] !== b[i]) {
            break;
        }
        count++;
    }
    return count;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function focusOnBookmarkItem(targetItem) {
    if (!targetItem) {
        return;
    }

    let parent = targetItem.parentElement;
    while (parent && !parent.classList.contains('tree-container')) {
        if (parent.classList.contains('folder-children')) {
            parent.style.display = 'block';
            const folderItem = parent.closest('.bookmark-item');
            if (folderItem) {
                folderItem.classList.add('expanded');
                const expandIcon = folderItem.querySelector('.expand-icon');
                if (expandIcon) {
                    expandIcon.style.transform = 'rotate(90deg)';
                }
                const folderIcon = folderItem.querySelector('.folder-icon');
                if (folderIcon) {
                    folderIcon.textContent = '\u{1F4C2}';
                }
            }
        }
        parent = parent.parentElement;
    }

    document.querySelectorAll('.bookmark.selected, .folder.selected').forEach(el => {
        el.classList.remove('selected');
    });

    const focusTarget = targetItem.querySelector('.bookmark') || targetItem.querySelector('.folder');
    if (focusTarget) {
        focusTarget.classList.add('selected');
    }

    const container = targetItem.closest('.tree-container');
    requestAnimationFrame(() => {
        if (container) {
            const containerRect = container.getBoundingClientRect();
            const itemRect = targetItem.getBoundingClientRect();
            const offset = itemRect.top - containerRect.top - (containerRect.height / 2) + (itemRect.height / 2);
            container.scrollTo({
                top: container.scrollTop + offset,
                behavior: 'smooth'
            });
        } else {
            targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        targetItem.classList.add('current-diff');
        setTimeout(() => {
            targetItem.classList.remove('current-diff');
        }, 3000);
    });
}

function scrollToRelativePosition(sourceItem, targetContainer) {
    const sourceContainer = sourceItem.closest('.tree-container');
    if (!sourceContainer) {
        return false;
    }

    const sourceItems = Array.from(sourceContainer.querySelectorAll('.bookmark-item'));
    const targetItems = Array.from(targetContainer.querySelectorAll('.bookmark-item'));
    if (!sourceItems.length || !targetItems.length) {
        return false;
    }

    const sourceIndex = sourceItems.indexOf(sourceItem);
    if (sourceIndex < 0) {
        return false;
    }

    const sourceDenominator = Math.max(sourceItems.length - 1, 1);
    const targetDenominator = Math.max(targetItems.length - 1, 0);
    const ratio = sourceItems.length === 1 ? 0 : sourceIndex / sourceDenominator;
    const targetIndex = Math.min(targetItems.length - 1, Math.round(ratio * targetDenominator));
    const targetItem = targetItems[targetIndex];
    if (!targetItem) {
        return false;
    }

    focusOnBookmarkItem(targetItem);
    return true;
}


// 处理文件导入
async function handleFileImport(event, side) {
    console.log(`开始导入${side}侧书签文件`);
    const file = event.target.files[0];
    if (!file) {
        console.warn('没有选择文件');
        return;
    }
    console.log('选择的文件:', file.name, '类型:', file.type);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        console.log('文件内容长度:', content.length);
        try {
            let bookmarks;
            // 智能识别文件类型
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                console.log('检测到JSON格式书签');
                bookmarks = parseJsonBookmarks(content);
            } else if (content.includes('<DL>') || content.includes('<dl>')) {
                // 检查是否是 Netscape 格式
                if (content.includes('<!DOCTYPE NETSCAPE-Bookmark-file-1>')) {
                    console.log('检测到Netscape格式书签');
                    bookmarks = parseNetscapeBookmarks(content);
                } else {
                    console.log('检测到HTML格式书签');
                    bookmarks = parseHtmlBookmarks(content);
                }
            } else {
                throw new Error('无法识别的书签文件格式');
            }

            // 检查解析结果
            if (!bookmarks || bookmarks.length === 0) {
                console.warn('未能解析出任何书签');
                throw new Error('未能从文件中解析出任何书签');
            }

            console.log(`解析得到的书签数量:`, bookmarks.length);

            if (side === 'left') {
                leftBookmarks = bookmarks;
                console.log('更新左侧书签数组:', leftBookmarks);
                renderBookmarkTree('leftBookmarks', bookmarks);
            } else {
                rightBookmarks = bookmarks;
                console.log('更新右侧书签数组:', rightBookmarks);
                renderBookmarkTree('rightBookmarks', bookmarks);
            }

            // 保存状态
            saveState();

            // 如果两侧都有书签，自动进入差异模式
            if (leftBookmarks.length > 0 && rightBookmarks.length > 0) {
                console.log('两侧都有书签，自动进入差异模式');
                diffMode = true;
                const diffs = compareTrees();
                if (diffs && diffs.length > 0) {
                    console.log('找到差异，自动标记');
                    markDifferences(true);
                    // 显示差异功能面板
                    document.getElementById('diffFunctionPanel').style.display = 'flex';
                    // 显示差异数量提示
                    showToast(`发现 ${diffs.length} 处差异`, 'success', true);
                }
            }

        } catch (error) {
            console.error('解析书签文件时出错:', error);
            console.error('错误堆栈:', error.stack);
            showToast('书签文件解析失败: ' + error.message, 'error');
        }
    };
    
    reader.onerror = (error) => {
        console.error('读取文件时出错:', error);
        showToast('文件读取失败', 'error');
    };
    
    reader.readAsText(file);
}

// 解析JSON格式书签
function parseJsonBookmarks(content) {
    const data = JSON.parse(content);
    console.log('JSON数据结构:', data);

    function processNode(node) {
        if (Array.isArray(node)) {
            return node.map(processNode);
        }
        
        // Chrome书签格式
        if (node.type === 'folder') {
            return {
                title: node.name || node.title,
                children: node.children ? node.children.map(processNode) : []
            };
        } else if (node.type === 'url' || node.url) {
            return {
                title: node.name || node.title,
                url: node.url,
                icon: node.icon || node.iconUrl || '',
                dateAdded: node.dateAdded || node.date_added || Date.now()
            };
        }
        
        // 其他JSON格式
        if (node.children || node.items) {
            return {
                title: node.name || node.title,
                children: (node.children || node.items).map(processNode)
            };
        } else if (node.url) {
            return {
                title: node.name || node.title,
                url: node.url,
                icon: node.icon || node.iconUrl || '',
                dateAdded: node.dateAdded || node.date_added || Date.now()
            };
        }
        
        return node;
    }

    return processNode(data);
}

// 解析Netscape格式书签
function parseNetscapeBookmarks(content) {
    console.log('开始解析Netscape格式书签');
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    function traverse(node, level = 0) {
        console.log(`解析层级 ${level} 的节点:`, node.tagName);
        const items = [];
        const children = Array.from(node.children);
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'DT') {
                const link = child.querySelector('A');
                const h3 = child.querySelector('H3');
                const nextDL = child.nextElementSibling;
                
                if (h3) {
                    // 这是一个文件夹
                    console.log(`发现文件夹: ${h3.textContent.trim()}`);
                    const dl = nextDL && nextDL.tagName === 'DD' ? nextDL.querySelector('DL') : child.querySelector('DL');
                    const folder = {
                        title: h3.textContent.trim(),
                        children: dl ? traverse(dl, level + 1) : []
                    };
                    console.log(`文件夹 ${folder.title} 包含 ${folder.children.length} 个子项`);
                    items.push(folder);
                } else if (link) {
                    // 这是一个书签
                    console.log(`发现书签: ${link.textContent.trim()}`);
                    items.push({
                        title: link.textContent.trim(),
                        url: link.href,
                        icon: link.getAttribute('ICON') || link.getAttribute('icon') || '',
                        dateAdded: parseInt(link.getAttribute('ADD_DATE') || link.getAttribute('add_date')) || Date.now()
                    });
                }
            } else if (child.tagName === 'DL') {
                // 直接遍历 DL 标签内的内容
                items.push(...traverse(child, level));
            }
        }
        
        return items;
    }
    
    // 查找书签的根节点
    let rootNode = doc.querySelector('DL');
    if (!rootNode) {
        console.error('找不到书签根节点 DL');
        throw new Error('无效的Netscape书签文件格式');
    }
    
    // 尝试查找真正的书签开始位置
    const bookmarksRoot = doc.querySelector('H1, H3');
    if (bookmarksRoot) {
        console.log('找到书签根目录:', bookmarksRoot.textContent.trim());
        const parentDL = bookmarksRoot.closest('DL');
        if (parentDL) {
            rootNode = parentDL;
        }
    }
    
    const bookmarks = traverse(rootNode);
    console.log('解析完成，总共找到书签数:', countBookmarks(bookmarks));
    return bookmarks;
}

// 统计书签总数的辅助函数
function countBookmarks(items) {
    let count = 0;
    function traverse(nodes) {
        nodes.forEach(node => {
            if (node.url) {
                count++;
            }
            if (node.children) {
                traverse(node.children);
            }
        });
    }
    traverse(items);
    return count;
}

// 解析HTML格式书签
function parseHtmlBookmarks(html) {
    console.log('开始解析HTML格式书签');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    function traverse(node) {
        const items = [];
        const children = Array.from(node.children);
        
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'DT') {
                const link = child.querySelector('A');
                const h3 = child.querySelector('H3');
                
                if (link) {
                    items.push({
                        title: link.textContent.trim(),
                        url: link.href,
                        icon: link.getAttribute('icon') || '',
                        dateAdded: parseInt(link.getAttribute('add_date')) || Date.now()
                    });
                } else if (h3) {
                    const dl = child.querySelector('DL');
                    items.push({
                        title: h3.textContent.trim(),
                        children: dl ? traverse(dl) : []
                    });
                }
            } else if (child.tagName === 'DL') {
                items.push(...traverse(child));
            }
        }
        
        return items;
    }
    
    const mainDL = doc.querySelector('DL');
    if (!mainDL) {
        throw new Error('无效的HTML书签文件格式');
    }
    
    return traverse(mainDL);
}

// 创建书签树节点的函数
function createTreeItem(bookmark, level = 0, path = []) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.level = level;
    item.dataset.path = [...path, bookmark.title].join(' > ');
    item.draggable = true; // 添加拖拽属性
    
    // 添加拖拽事件监听器
    item.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        item.classList.add('dragging');
        const bookmarkData = {
            title: bookmark.title,
            url: bookmark.url,
            icon: bookmark.icon || '',
            isFolder: !!bookmark.children,
            children: bookmark.children,
            path: item.dataset.path
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(bookmarkData));
    });
    
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
    });
    
    if (bookmark.children) {
        // 创建文件夹节点
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder';
        
        // 添加展开/折叠图标
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '▶';
        expandIcon.style.marginRight = '8px';
        expandIcon.style.display = 'inline-block';
        expandIcon.style.transition = 'transform 0.2s';
        folderDiv.appendChild(expandIcon);
        
        // 添加文件夹图标
        const folderIcon = document.createElement('span');
        folderIcon.className = 'folder-icon';
        folderIcon.textContent = '📁';
        folderIcon.style.marginRight = '8px';
        folderDiv.appendChild(folderIcon);
        
        // 添加文件夹标题
        const titleSpan = document.createElement('span');
        titleSpan.className = 'folder-title';
        titleSpan.textContent = bookmark.title;
        folderDiv.appendChild(titleSpan);
        
        // 创建子项容器
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'folder-children';
        childrenDiv.style.display = 'none';
        
        // 添加点击事件
        folderDiv.addEventListener('click', (e) => {
            console.log('点击文件夹:', bookmark.title);
            e.stopPropagation();
            
            // 移除其他元素的选中状态
            document.querySelectorAll('.bookmark.selected, .folder.selected').forEach(el => {
                el.classList.remove('selected');
            });
            
            // 添加选中状态
            folderDiv.classList.add('selected');
            
            // 处理展开/折叠
            const isExpanded = item.classList.toggle('expanded');
            expandIcon.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0)';
            childrenDiv.style.display = isExpanded ? 'block' : 'none';
            folderIcon.textContent = isExpanded ? '📂' : '📁';
        });
        
        // 添加文件夹和子项容器到item
        item.appendChild(folderDiv);
        item.appendChild(childrenDiv);
        
        // 递归添加子项
        if (bookmark.children && bookmark.children.length > 0) {
            console.log(`处理文件夹 ${bookmark.title} 的子项:`, bookmark.children.length);
            bookmark.children.forEach(child => {
                const childItem = createTreeItem(child, level + 1, [...path, bookmark.title]);
                childrenDiv.appendChild(childItem);
            });
            
            // 添加子项数量提示
            const countSpan = document.createElement('span');
            countSpan.className = 'folder-count';
            countSpan.textContent = `(${bookmark.children.length})`;
            countSpan.style.marginLeft = '8px';
            countSpan.style.color = 'var(--text-secondary)';
            countSpan.style.fontSize = '12px';
            titleSpan.appendChild(countSpan);
        }
    } else {
        // 创建书签节点
        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'bookmark';
        
        // 添加图标
        const icon = document.createElement('img');
        icon.src = bookmark.icon || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAB7SURBVDiN7ZOxCsAgDESv1q8X3Pz/L3Hu4Jx2cxEqpWIphC4ZQnKPkAjgH2DmA7xnf4ByzgB6Uv0WyzkHAFprj7YQAmKMmVJKAPuqXGsF5+xMIdWc8zR3EQFVxbZtQ+GUkpl5zBTLWgtmxrquQ+GUEkII771/+xd3XgBk5V/sxhXz1QAAAABJRU5ErkJggg==';
        icon.width = 16;
        icon.height = 16;
        icon.style.marginRight = '8px';
        bookmarkDiv.appendChild(icon);
        
        // 添加标题
        const title = document.createElement('span');
        title.className = 'bookmark-title';
        title.textContent = bookmark.title;
        title.dataset.url = bookmark.url;
        bookmarkDiv.appendChild(title);
        
        // 添加点击选中事件
        bookmarkDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.bookmark.selected').forEach(el => {
                el.classList.remove('selected');
            });
            bookmarkDiv.classList.add('selected');
        });
        
        item.appendChild(bookmarkDiv);
    }
    
    return item;
}

// 渲染书签树
function renderBookmarkTree(containerId, bookmarks) {
    console.log(`开始渲染书签树 ${containerId}`, '书签数量:', bookmarks.length);
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`找不到容器元素: ${containerId}`);
        return;
    }
    container.innerHTML = '';
    
    // 创建根节点
    console.log('创建书签树根节点');
    const rootDiv = document.createElement('div');
    rootDiv.className = 'bookmark-tree';
    
    // 添加所有书签到根节点
    console.log('开始添加顶层书签到根节点');
    bookmarks.forEach((bookmark, index) => {
        console.log(`添加第 ${index + 1} 个顶层节点:`, bookmark.title);
        rootDiv.appendChild(createTreeItem(bookmark));
    });
    
    // 将根节点添加到容器
    console.log('将书签树添加到容器');
    container.appendChild(rootDiv);
    console.log('书签树渲染完成');
}

// 更新比较树函数
function compareTrees() {
    console.log('开始比较书签树...');
    console.log('左侧书签数量:', leftBookmarks?.length);
    console.log('右侧书签数量:', rightBookmarks?.length);
    
    if (!leftBookmarks || !rightBookmarks) {
        console.warn('书签数据不完整，跳过比较');
        return [];
    }
    
    let added = 0, modified = 0, deleted = 0, duplicated = 0;
    differences = [];
    currentDiffIndex = -1;
    
    function compareNodes(left, right) {
        console.log('比较节点...');
        if (!left || !right) return;
        
        const leftMap = new Map();
        const rightMap = new Map();
        const processedUrls = new Set();
        const urlCountMap = new Map(); // 用于统计URL出现次数
        const urlPathsMap = new Map(); // 用于收集每个URL的所有路径
        
        function collectItems(node, itemMap, path = [], isLeft) {
            if (node.url) {
                const currentPath = [...path, node.title].join(' > ');
                // 统计URL出现次数并收集路径
                if (isLeft) {
                    urlCountMap.set(node.url, (urlCountMap.get(node.url) || 0) + 1);
                    if (!urlPathsMap.has(node.url)) {
                        urlPathsMap.set(node.url, []);
                    }
                    urlPathsMap.get(node.url).push({
                        title: node.title,
                        path: currentPath
                    });
                }
                itemMap.set(node.title, {
                    title: node.title,
                    url: node.url,
                    icon: node.icon,
                    path: currentPath
                });
            }
            if (node.children) {
                node.children.forEach(child => {
                    collectItems(child, itemMap, [...path, node.title || '根目录'], isLeft);
                });
            }
        }
        
        // 收集所有书签
        left.forEach(node => collectItems(node, leftMap, [], true));
        right.forEach(node => collectItems(node, rightMap, [], false));
        
        // 检查重复书签
        for (const [url, count] of urlCountMap) {
            if (count > 1) {
                console.log(`发现重复书签: ${url} (${count}次)`);
                duplicated++;
                // 获取所有具有相同URL的书签的路径
                const paths = urlPathsMap.get(url);
                // 添加差异项，包含所有重复路径
                differences.push({
                    type: 'duplicated',
                    item: paths[0],
                    paths: paths,
                    url: url,
                    count: count
                });
            }
        }
        
        // 检查修改的书签
        for (const [title, leftItem] of leftMap) {
            const rightItem = rightMap.get(title);
            if (rightItem) {
                if (leftItem.url !== rightItem.url || leftItem.title !== rightItem.title) {
                    console.log(`发现修改: ${leftItem.title} (${leftItem.url}) -> ${rightItem.title} (${rightItem.url})`);
                    modified++;
                    differences.push({
                        type: 'modified',
                        leftItem: leftItem,
                        rightItem: rightItem,
                        path: rightItem.path,
                        changeType: leftItem.url !== rightItem.url ? 'url' : 'title'
                    });
                    processedUrls.add(leftItem.url);
                    processedUrls.add(rightItem.url);
                }
            }
        }
        
        // 检查新增的书签
        for (const [title, rightItem] of rightMap) {
            if (!processedUrls.has(rightItem.url) && !leftMap.has(title)) {
                console.log(`发现新增: ${rightItem.title} (${rightItem.url})`);
                added++;
                differences.push({
                    type: 'added',
                    item: rightItem,
                    path: rightItem.path
                });
                processedUrls.add(rightItem.url);
            }
        }
        
        // 检查删除的书签
        for (const [title, leftItem] of leftMap) {
            if (!processedUrls.has(leftItem.url) && !rightMap.has(title)) {
                console.log(`发现删除: ${leftItem.title} (${leftItem.url})`);
                deleted++;
                differences.push({
                    type: 'deleted',
                    item: leftItem,
                    path: leftItem.path
                });
                processedUrls.add(leftItem.url);
            }
        }
    }
    
    compareNodes(leftBookmarks, rightBookmarks);
    
    // 更新差异统计
    document.getElementById('addedCount').textContent = added;
    document.getElementById('modifiedCount').textContent = modified;
    document.getElementById('deletedCount').textContent = deleted;
    document.getElementById('duplicatedCount').textContent = duplicated;
    
    // 更新差异列表
    updateDiffList();
    
    console.log(`比较完成，找到 ${differences.length} 处差异：`);
    console.log(`- 新增: ${added}`);
    console.log(`- 修改: ${modified}`);
    console.log(`- 删除: ${deleted}`);
    console.log(`- 重复: ${duplicated}`);
    console.log('差异数组:', differences);
    return differences;
}

// 更新差异列表显示
function updateDiffList(filterType = null) {
    const diffList = document.getElementById('diffList');
    diffList.innerHTML = '';
    
    // 移除所有统计块的激活状态
    document.querySelectorAll('.diff-count').forEach(count => {
        count.classList.remove('active');
    });
    
    // 如果有过滤类型，激活对应的统计块
    if (filterType) {
        document.querySelector(`.diff-count.${filterType}`).classList.add('active');
    }
    
    // 过滤差异
    const filteredDiffs = filterType ? 
        differences.filter(diff => diff.type === filterType) : 
        differences;
    
    if (filteredDiffs.length === 0) {
        const noResult = document.createElement('div');
        noResult.className = 'no-result';
        noResult.textContent = '未发现差异';
        diffList.appendChild(noResult);
        return;
    }
    
    // 如果当前差异索引无效，设置为0
    if (currentDiffIndex === -1 || currentDiffIndex >= filteredDiffs.length) {
        console.log('重置当前差异索引为0');
        currentDiffIndex = 0;
    }
    
    filteredDiffs.forEach((diff, index) => {
        const diffItem = document.createElement('div');
        diffItem.className = `diff-item ${diff.type}`;
        diffItem.dataset.index = index;
        
        // 如果是当前选中的差异项，添加选中样式
        if (index === currentDiffIndex) {
            diffItem.classList.add('selected');
        }
        
        let typeText = '';
        let title = '';
        let details = '';
        let pathsHtml = '';
        
        switch (diff.type) {
            case 'added':
                typeText = '新增';
                title = diff.item.title;
                details = diff.item.url;
                break;
            case 'deleted':
                typeText = '删除';
                title = diff.item.title;
                details = diff.item.url;
                break;
            case 'modified':
                typeText = '修改';
                if (diff.leftItem.title !== diff.rightItem.title) {
                    title = `${diff.leftItem.title} → ${diff.rightItem.title}`;
                } else {
                    title = diff.leftItem.title;
                }
                if (diff.leftItem.url !== diff.rightItem.url) {
                    details = `${diff.leftItem.url} → ${diff.rightItem.url}`;
                }
                break;
            case 'duplicated':
                typeText = '重复';
                title = diff.item.title;
                details = diff.url;
                // 创建所有重复路径的HTML
                pathsHtml = diff.paths.map((p, idx) => 
                    `<div class="duplicate-path" data-path="${p.path}" data-title="${p.title}">
                        <span class="duplicate-title">${p.title}</span>
                        <span class="duplicate-path-text">${p.path}</span>
                     </div>`
                ).join('');
                break;
        }
        
        diffItem.innerHTML = `
            <span class="diff-type">${typeText}</span>
            <div class="diff-content">
                <div class="diff-title" title="${title}">${title}</div>
                ${details ? `<div class="diff-details" title="${details}">${details}</div>` : ''}
                ${diff.type === 'duplicated' ? `<div class="duplicate-paths">${pathsHtml}</div>` : ''}
            </div>
            ${diff.type !== 'duplicated' ? `<span class="diff-path" title="${diff.path}">${diff.path}</span>` : ''}
        `;
        
        // 点击差异项跳转到对应书签
        diffItem.addEventListener('click', () => {
            console.log('点击差异项，索引:', index);
            // 移除其他项的选中状态
            document.querySelectorAll('.diff-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            // 添加当前项的选中状态
            diffItem.classList.add('selected');
            
            currentDiffIndex = index;
            console.log('设置当前差异索引为:', currentDiffIndex);
            
            // 对于重复书签，不执行跳转
            if (diff.type === 'duplicated') {
                return;
            }
            
            // 高亮并跳转到当前差异
            highlightCurrentDiff();

            // 获取当前差异项
            const currentDiff = filteredDiffs[currentDiffIndex];
            if (currentDiff) {
                let targetContainer, targetTitle, targetPath;
                switch (currentDiff.type) {
                    case 'added':
                        targetContainer = document.getElementById('rightBookmarks');
                        targetTitle = currentDiff.item.title;
                        targetPath = currentDiff.path;
                        navigateToBookmark(targetContainer, targetTitle, targetPath);
                        break;
                    case 'deleted':
                        targetContainer = document.getElementById('leftBookmarks');
                        targetTitle = currentDiff.item.title;
                        targetPath = currentDiff.path;
                        navigateToBookmark(targetContainer, targetTitle, targetPath);
                        break;
                    case 'modified':
                        // 同时滚动到左右两侧
                        navigateToBookmark(document.getElementById('leftBookmarks'), currentDiff.leftItem.title, currentDiff.path);
                        navigateToBookmark(document.getElementById('rightBookmarks'), currentDiff.rightItem.title, currentDiff.path);
                        break;
                }
            }

            // 点击后只关闭差异统计面板，保持功能按钮可见
            const diffPanel = document.getElementById('diffPanel');
            diffPanel.classList.remove('fade-in');
            diffPanel.classList.add('fade-out');
            setTimeout(() => {
                diffPanel.style.display = 'none';
            }, 300);
        });
        
        diffList.appendChild(diffItem);

        // 如果是重复书签，为路径项添加点击事件
        if (diff.type === 'duplicated') {
            const pathItems = diffItem.querySelectorAll('.duplicate-path');
            pathItems.forEach(pathItem => {
                pathItem.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡
                    const path = pathItem.dataset.path;
                    const title = pathItem.dataset.title;
                    const container = document.getElementById('leftBookmarks');
                    
                    // 展开到指定路径并高亮书签
                    expandToPath(container, path, title);
                    
                    // 点击后关闭差异面板
                    const diffPanel = document.getElementById('diffPanel');
                    diffPanel.classList.remove('fade-in');
                    diffPanel.classList.add('fade-out');
                    setTimeout(() => {
                        diffPanel.style.display = 'none';
                    }, 300);
                });
                
                // 添加鼠标悬停效果
                pathItem.style.cursor = 'pointer';
            });
        }
    });
}

// 添加统计块点击事件处理函数
function setupDiffCountHandlers() {
    const diffCounts = document.querySelectorAll('.diff-count');
    diffCounts.forEach(count => {
        count.addEventListener('click', () => {
            const type = count.classList.contains('added') ? 'added' :
                        count.classList.contains('modified') ? 'modified' :
                        count.classList.contains('deleted') ? 'deleted' :
                        count.classList.contains('duplicated') ? 'duplicated' : null;
            
            // 如果当前类型已经激活，则取消筛选
            if (count.classList.contains('active')) {
                updateDiffList(null);
            } else {
                updateDiffList(type);
            }
        });
    });
}

// 标记差异
function markDifferences(showNotification = true) {
    // 如果没有差异数组，先计算差异
    if (!differences || !differences.length) {
        differences = compareTrees();
    }
    
    if (!differences || differences.length === 0) {
        if (showNotification) {
            showToast('未发现差异');
        }
        return;
    }
    
    // 重置当前差异索引
    if (currentDiffIndex === -1 || currentDiffIndex >= differences.length) {
        console.log('重置当前差异索引为0');
        currentDiffIndex = 0;
    }
    
    // 先清除所有已有的差异标记
    document.querySelectorAll('.diff-added, .diff-deleted, .diff-modified').forEach(el => {
        el.classList.remove('diff-added', 'diff-deleted', 'diff-modified');
    });
    
    // 标记差异
    differences.forEach(diff => {
        let targetContainer, targetTitle;
        switch (diff.type) {
            case 'added':
                targetContainer = document.getElementById('rightBookmarks');
                targetTitle = diff.item.title;
                markBookmark(targetContainer, targetTitle, 'added', diff.path);
                break;
            case 'deleted':
                targetContainer = document.getElementById('leftBookmarks');
                targetTitle = diff.item.title;
                markBookmark(targetContainer, targetTitle, 'deleted', diff.path);
                break;
            case 'modified':
                // 标记左侧修改的书签
                markBookmark(document.getElementById('leftBookmarks'), diff.leftItem.title, 'modified', diff.path);
                // 标记右侧修改的书签
                markBookmark(document.getElementById('rightBookmarks'), diff.rightItem.title, 'modified', diff.path);
                break;
        }
    });
    
    // 显示标记完成的提示
    if (showNotification) {
        showToast(`已标记 ${differences.length} 处差异`, 'success', true);
    }
}

// 修改高亮当前差异的函数
function highlightCurrentDiff() {
    console.log('高亮当前差异');
    console.log('当前差异索引:', currentDiffIndex);
    console.log('差异数组:', differences);
    
    // 移除之前的高亮动画
    document.querySelectorAll('.current-diff').forEach(el => {
        el.classList.remove('current-diff');
    });
    
    if (currentDiffIndex === -1 || !differences || !differences[currentDiffIndex]) {
        console.warn('无效的差异索引或差异数据');
        console.warn('currentDiffIndex:', currentDiffIndex);
        console.warn('differences:', differences);
        return;
    }
    
    const diff = differences[currentDiffIndex];
    console.log('当前差异项:', diff);
    
    // 如果是文件夹，跳过
    if (!diff.item?.url && !diff.leftItem?.url && !diff.rightItem?.url) {
        console.log('当前差异项是文件夹，跳过');
        // 移动到下一个差异项
        currentDiffIndex = (currentDiffIndex >= differences.length - 1) ? 0 : currentDiffIndex + 1;
        console.log('更新差异索引为:', currentDiffIndex);
        highlightCurrentDiff();
        return;
    }
    
    // 根据差异类型查找对应的书签
    let targetContainer, targetTitle;
    switch (diff.type) {
        case 'added':
            targetContainer = document.getElementById('rightBookmarks');
            targetTitle = diff.item.title;
            console.log('处理新增差异:', targetTitle);
            scrollToBookmark(targetContainer, targetTitle);
            break;
        case 'deleted':
            targetContainer = document.getElementById('leftBookmarks');
            targetTitle = diff.item.title;
            console.log('处理删除差异:', targetTitle);
            scrollToBookmark(targetContainer, targetTitle);
            break;
        case 'modified':
            console.log('处理修改差异');
            console.log('左侧书签:', diff.leftItem.title);
            console.log('右侧书签:', diff.rightItem.title);
            // 同时滚动到左右两侧
            scrollToBookmark(document.getElementById('leftBookmarks'), diff.leftItem.title);
            scrollToBookmark(document.getElementById('rightBookmarks'), diff.rightItem.title);
            break;
    }
}

// 辅助函数：滚动到特定书签
function scrollToBookmark(container, title) {
    if (!container || !title) return;
    
    const bookmarkItems = container.querySelectorAll('.bookmark-item');
    bookmarkItems.forEach(item => {
        const bookmarkTitle = item.querySelector('.bookmark-title');
        if (bookmarkTitle && bookmarkTitle.textContent === title) {
            // 展开所有父文件夹
            let parent = item.parentElement;
            while (parent) {
                if (parent.classList.contains('folder-children')) {
                    parent.style.display = 'block';
                    const folderItem = parent.parentElement;
                    if (folderItem) {
                        folderItem.classList.add('expanded');
                        const expandIcon = folderItem.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.style.transform = 'rotate(90deg)';
                        }
                        const folderIcon = folderItem.querySelector('.folder-icon');
                        if (folderIcon) {
                            folderIcon.textContent = '📂';
                        }
                    }
                }
                parent = parent.parentElement;
            }
            
            // 只给书签项添加动画效果
            const bookmarkElement = item.querySelector('.bookmark');
            if (bookmarkElement) {
                bookmarkElement.classList.add('current-diff');
            }
            
            // 滚动到视图
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// 修改导航函数
function navigateToPrevDiff() {
    console.log('导航到上一个差异');
    console.log('当前差异索引:', currentDiffIndex);
    console.log('差异数组:', differences);
    console.log('差异模式:', diffMode);
    
    // 如果没有书签数据，提示用户
    if (!leftBookmarks.length || !rightBookmarks.length) {
        console.warn('书签数据不完整');
        showToast('请先导入书签文件');
        return;
    }

    // 如果没有差异数组或不在差异模式，先进入差异模式并计算差异
    if (!differences || !differences.length || !diffMode) {
        console.log('重新计算差异');
        diffMode = true;
        differences = compareTrees();
        
        // 显示差异功能面板
        document.getElementById('diffFunctionPanel').style.display = 'flex';
    }
    
    // 如果还是没有差异，提示用户
    if (!differences || differences.length === 0) {
        console.warn('未找到差异');
        showToast('未发现差异');
        return;
    }
    
    // 更新当前差异索引
    if (currentDiffIndex === -1) {
        currentDiffIndex = differences.length - 1;
    } else {
        currentDiffIndex = (currentDiffIndex <= 0) ? differences.length - 1 : currentDiffIndex - 1;
    }
    
    console.log('更新后的差异索引:', currentDiffIndex);
    
    // 高亮当前差异
    highlightCurrentDiff();
}

function navigateToNextDiff() {
    console.log('导航到下一个差异');
    console.log('当前差异索引:', currentDiffIndex);
    console.log('差异数组:', differences);
    console.log('差异模式:', diffMode);
    
    // 如果没有书签数据，提示用户
    if (!leftBookmarks.length || !rightBookmarks.length) {
        console.warn('书签数据不完整');
        showToast('请先导入书签文件');
        return;
    }

    // 如果没有差异数组或不在差异模式，先进入差异模式并计算差异
    if (!differences || !differences.length || !diffMode) {
        console.log('重新计算差异');
        diffMode = true;
        differences = compareTrees();
        
        // 显示差异功能面板
        document.getElementById('diffFunctionPanel').style.display = 'flex';
    }
    
    // 如果还是没有差异，提示用户
    if (!differences || differences.length === 0) {
        console.warn('未找到差异');
        showToast('未发现差异');
        return;
    }
    
    // 更新当前差异索引
    if (currentDiffIndex === -1) {
        currentDiffIndex = 0;
    } else {
        currentDiffIndex = (currentDiffIndex >= differences.length - 1) ? 0 : currentDiffIndex + 1;
    }
    
    console.log('更新后的差异索引:', currentDiffIndex);
    
    // 高亮当前差异
    highlightCurrentDiff();
}

// 复制差异
function copyDiff(direction) {
    console.log('开始复制差异，方向:', direction);
    console.log('当前差异索引:', currentDiffIndex);
    console.log('差异数组长度:', differences?.length);
    
    // 检查是否有差异数据
    if (!differences || differences.length === 0) {
        console.warn('没有差异数据');
        showToast('请先点击"查找差异"按钮');
        return;
    }
    
    // 检查是否选择了差异项
    if (currentDiffIndex === -1) {
        console.warn('未选择差异项');
        showToast('请先在差异列表中选择要复制的项');
        // 自动显示差异面板
        const diffPanel = document.getElementById('diffPanel');
        diffPanel.style.display = 'block';
        diffPanel.classList.remove('fade-out');
        diffPanel.classList.add('fade-in');
        return;
    }
    
    // 检查选择的差异项是否有效
    if (!differences[currentDiffIndex]) {
        console.warn('无效的差异索引或差异数据');
        console.warn('differences:', differences);
        console.warn('currentDiffIndex:', currentDiffIndex);
        showToast('选择的差异项无效，请重新选择');
        return;
    }
    
    const diff = differences[currentDiffIndex];
    console.log('当前差异数据:', diff);
    
    let sourceItem, targetContainer, targetBookmarks;
    
    if (direction === 'left') {
        sourceItem = diff.type === 'added' ? diff.item : diff.rightItem;
        targetContainer = document.getElementById('leftBookmarks');
        targetBookmarks = leftBookmarks;
    } else {
        sourceItem = diff.type === 'deleted' ? diff.item : diff.leftItem;
        targetContainer = document.getElementById('rightBookmarks');
        targetBookmarks = rightBookmarks;
    }
    
    console.log('源项目:', sourceItem);
    console.log('目标容器:', targetContainer.id);
    console.log('目标书签数组长度:', targetBookmarks.length);
    
    if (!sourceItem) {
        console.warn('未找到源项目');
        return;
    }
    
    // 创建新书签
    const newBookmark = {
        title: sourceItem.title,
        url: sourceItem.url,
        icon: sourceItem.icon || '',
        isFolder: false
    };
    console.log('创建新书签:', newBookmark);
    
    // 解析路径并创建文件夹结构
    const pathParts = diff.path.split(' > ');
    pathParts.pop(); // 移除最后一个元素（书签名）
    console.log('解析的路径部分:', pathParts);
    
    // 递归函数：在指定层级查找或创建文件夹
    function findOrCreateFolder(bookmarks, folderName) {
        console.log('查找或创建文件夹:', folderName);
        console.log('当前书签数组:', bookmarks);
        
        let folder = bookmarks.find(item => item.children && item.title === folderName);
        if (folder) {
            console.log('找到已存在的文件夹:', folder.title);
        } else {
            console.log('创建新文件夹:', folderName);
            folder = {
                title: folderName,
                children: []
            };
            bookmarks.push(folder);
        }
        return folder;
    }
    
    // 从根开始构建路径
    let currentLevel = targetBookmarks;
    console.log('开始构建文件夹路径...');
    
    for (const folderName of pathParts) {
        console.log('处理文件夹:', folderName);
        const folder = findOrCreateFolder(currentLevel, folderName);
        currentLevel = folder.children;
        console.log('当前层级子项数量:', currentLevel.length);
    }
    
    // 添加书签到当前层级
    console.log('将书签添加到最终层级，当前层级项目数:', currentLevel.length);
    currentLevel.push(newBookmark);
    
    // 重新渲染目标侧的书签树
    console.log('重新渲染书签树...');
    if (direction === 'left') {
        renderBookmarkTree('leftBookmarks', targetBookmarks);
    } else {
        renderBookmarkTree('rightBookmarks', targetBookmarks);
    }
    
    // 展开到目标路径并高亮新书签
    console.log('准备展开到目标路径:', diff.path);
    setTimeout(() => {
        console.log('展开路径并高亮书签:', newBookmark.title);
        expandToPath(targetContainer, diff.path, newBookmark.title);
    }, 100);
    
    // 更新书签数组
    console.log('更新书签数组...');
    updateBookmarkArrays();
    
    // 显示成功提示
    const message = direction === 'left' ? '已复制到左侧' : '已复制到右侧';
    console.log('操作完成:', message);
    showToast(message);
}

// 处理右键菜单
function handleContextMenu(e) {
    e.preventDefault();
    
    // 先隐藏已经显示的菜单
    hideContextMenu();
    
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    
    // 调整菜单位置，确保不超出视窗
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - menuRect.width - 5}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - menuRect.height - 5}px`;
    }
    
    // 检查是否点击在书签项或文件夹上
    const bookmarkItem = e.target.closest('.bookmark-item');
    const container = e.target.closest('.tree-container');
    
    // 激活当前容器
    if (container) {
        setActiveContainer(container);
    }
    
    if (bookmarkItem) {
        // 点击在书签项或文件夹上
        menu.dataset.targetBookmarkItem = bookmarkItem.id || Math.random().toString(36).substr(2, 9);
        bookmarkItem.id = menu.dataset.targetBookmarkItem;
        
        // 获取当前容器
        const isLeftContainer = container.id === 'leftBookmarks';
        
        // 根据类型显示/隐藏菜单项
        const isFolder = bookmarkItem.querySelector('.folder') !== null;
        document.querySelectorAll('.menu-item').forEach(item => {
            const action = item.dataset.action;
            if (isFolder) {
                // 文件夹显示所有选项，除了复制链接
                item.style.display = ['copyUrl'].includes(action) ? 'none' : 'flex';
            } else {
                // 书签显示所有选项，除了展开/折叠
                item.style.display = ['expandAll', 'collapseAll'].includes(action) ? 'none' : 'flex';
            }
        });
    } else if (container) {
        // 点击在空白处
        menu.dataset.targetContainer = container.id;
        // 只显示新建文件夹和粘贴选项
        document.querySelectorAll('.menu-item').forEach(item => {
            const action = item.dataset.action;
            item.style.display = ['newFolder', 'paste'].includes(action) ? 'flex' : 'none';
        });
    }
    
    // 阻止事件冒泡
    e.stopPropagation();
}

// 隐藏右键菜单
function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.style.display = 'none';
        // 清除目标引用
        menu.dataset.targetBookmarkItem = '';
    }
}

// 获取书签的完整路径
function getBookmarkPath(bookmarkItem) {
    const path = [];
    let current = bookmarkItem;
    
    while (current && !current.classList.contains('tree-container')) {
        if (current.classList.contains('bookmark-item')) {
            const title = current.querySelector('.folder-title, .bookmark-title')?.textContent;
            if (title) {
                path.unshift(title.replace(/\(\d+\)$/, '').trim());
            }
        }
        current = current.parentElement;
    }
    
    return path;
}

// 根据路径查找书签
function findBookmarkByPath(container, sourcePath, targetTitle) {
    console.log('开始查找目标书签:', targetTitle);
    console.log('目标路径:', sourcePath);
    
    const allBookmarks = container.querySelectorAll('.bookmark-item');
    let bestMatch = null;
    let bestMatchScore = -1;
    
    for (const bookmark of allBookmarks) {
        const currentPath = getBookmarkPath(bookmark);
        const currentTitle = bookmark.querySelector('.bookmark-title')?.textContent;
        
        console.log('检查书签:', currentTitle);
        console.log('当前路径:', currentPath);
        
        // 检查标题是否匹配
        if (currentTitle === targetTitle) {
            // 计算路径相似度得分
            let score = 0;
            const minLength = Math.min(currentPath.length, sourcePath.length);
            for (let i = 0; i < minLength; i++) {
                if (currentPath[i] === sourcePath[i]) {
                    score++;
                }
            }
            
            // 更新最佳匹配
            if (score > bestMatchScore) {
                bestMatchScore = score;
                bestMatch = bookmark;
            }
        }
    }
    
    console.log('最佳匹配得分:', bestMatchScore);
    return bestMatch;
}

// 处理右键菜单项点击
function handleMenuItemClick(e) {
    const action = e.currentTarget.dataset.action;
    const menu = e.currentTarget.closest('.context-menu');
    const targetId = menu.dataset.targetBookmarkItem;
    const targetContainer = menu.dataset.targetContainer;
    const bookmarkItem = targetId ? document.getElementById(targetId) : null;
    const container = targetContainer ? document.getElementById(targetContainer) : null;
    
    switch (action) {
        case 'newFolder':
            createNewFolder(container || bookmarkItem?.closest('.tree-container'));
            break;
            
        case 'copy':
            if (bookmarkItem) {
                copyBookmark(bookmarkItem);
            }
            break;
            
        case 'paste':
            const targetElement = container || bookmarkItem?.closest('.tree-container');
            if (targetElement) {
                pasteBookmark(targetElement, bookmarkItem);
            }
            break;
            
        case 'edit':
            showEditDialog(bookmarkItem);
            break;
            
        case 'delete':
            if (confirm('确定要删除这个' + (bookmarkItem?.querySelector('.folder') ? '文件夹' : '书签') + '吗？')) {
                bookmarkItem?.remove();
                updateBookmarkArrays();
                showToast('删除成功');
            }
            break;
            
        case 'expandAll':
            const folderToExpand = bookmarkItem?.querySelector('.folder');
            if (folderToExpand) {
                expandAllSubFolders(bookmarkItem);
                showToast('已展开所有子文件夹');
            }
            break;
            
        case 'collapseAll':
            const folderToCollapse = bookmarkItem?.querySelector('.folder');
            if (folderToCollapse) {
                collapseAllSubFolders(bookmarkItem);
                showToast('已折叠所有子文件夹');
            }
            break;
            
        case 'jumpOtherSide':
            if (bookmarkItem) {
                const originContainer = bookmarkItem.closest('.tree-container');
                const isLeft = originContainer?.id === 'leftBookmarks';
                jumpToOtherSide(bookmarkItem, isLeft);
            } else {
                showToast('请在具体项目上使用该功能', 'warning');
            }
            break;

        case 'copyUrl':
            const bookmarkTitle = bookmarkItem?.querySelector('.bookmark-title');
            if (bookmarkTitle) {
                const url = bookmarkTitle.dataset.url;
                if (url) {
                    navigator.clipboard.writeText(url)
                        .then(() => showToast('链接已复制到剪贴板'))
                        .catch(() => showToast('复制失败'));
                }
            }
            break;
            
        case 'copyTitle':
            const titleElement = bookmarkItem?.querySelector('.bookmark-title');
            if (titleElement) {
                const title = titleElement.textContent;
                if (title) {
                    navigator.clipboard.writeText(title)
                        .then(() => showToast('标题已复制到剪贴板'))
                        .catch(() => showToast('复制失败'));
                }
            }
            break;
    }
    
    hideContextMenu();
}

// 展开所有子文件夹
function expandAllSubFolders(target) {
    const folders = target.querySelectorAll('.folder-children');
    folders.forEach(folder => {
        folder.style.display = 'block';
        const folderItem = folder.closest('.bookmark-item');
        if (folderItem) {
            folderItem.classList.add('expanded');
            const expandIcon = folderItem.querySelector('.expand-icon');
            if (expandIcon) {
                expandIcon.style.transform = 'rotate(90deg)';
            }
            const folderIcon = folderItem.querySelector('.folder-icon');
            if (folderIcon) {
                folderIcon.textContent = '📂';
            }
        }
    });
}

// 折叠所有子文件夹
function collapseAllSubFolders(target) {
    const folders = target.querySelectorAll('.folder-children');
    folders.forEach(folder => {
        folder.style.display = 'none';
        const folderItem = folder.closest('.bookmark-item');
        if (folderItem) {
            folderItem.classList.remove('expanded');
            const expandIcon = folderItem.querySelector('.expand-icon');
            if (expandIcon) {
                expandIcon.style.transform = 'rotate(0)';
            }
            const folderIcon = folderItem.querySelector('.folder-icon');
            if (folderIcon) {
                folderIcon.textContent = '📁';
            }
        }
    });
}

// 显示编辑对话框
function showEditDialog(target) {
    const dialog = document.getElementById('editDialog');
    const titleInput = document.getElementById('editTitle');
    const urlInput = document.getElementById('editUrl');
    
    // 获取实际点击的书签或文件夹元素
    const bookmarkItem = target.closest('.bookmark-item');
    if (!bookmarkItem) return;
    
    const isFolder = bookmarkItem.querySelector('.folder') !== null;
    const titleElement = isFolder ? 
        bookmarkItem.querySelector('.folder-title') : 
        bookmarkItem.querySelector('.bookmark .bookmark-title');
    
    if (!titleElement) return;
    
    titleInput.value = titleElement.textContent.replace(/\(\d+\)$/, '').trim();
    
    // 如果是书签，显示URL输入框，否则隐藏
    const urlGroup = urlInput.closest('.form-group');
    if (isFolder) {
        urlGroup.style.display = 'none';
        urlInput.value = '';
    } else {
        urlGroup.style.display = 'block';
        urlInput.value = titleElement.dataset.url || '';
    }
    
    dialog.style.display = 'flex';
    
    document.getElementById('editSave').onclick = () => {
        if (isFolder) {
            titleElement.textContent = titleInput.value;
            // 保持文件夹计数
            const countSpan = bookmarkItem.querySelector('.folder-count');
            if (countSpan) {
                titleElement.appendChild(countSpan);
            }
        } else {
            titleElement.textContent = titleInput.value;
            titleElement.dataset.url = urlInput.value;
        }
        
        dialog.style.display = 'none';
        updateBookmarkArrays();
        showToast('修改成功');
    };
    
    document.getElementById('editCancel').onclick = () => {
        dialog.style.display = 'none';
    };
}

// 显示提示消息
function showToast(message, type = 'normal', isFixed = false) {
    console.log('显示提示消息:', message, '类型:', type, '固定:', isFixed);
    
    if (type === 'warning') {
        // 警告类型使用中间浮窗
        let notification = document.createElement('div');
        notification.className = 'center-notification warning';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="warning-icon">⚠️</span>
                <span class="message">${message}</span>
            </div>
        `;
        document.body.appendChild(notification);
        
        // 显示提示
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 2秒后自动隐藏
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 2000);
        
        return;
    }
    
    if (isFixed) {
        // 使用底部固定提示栏
        let notification = document.querySelector('.bottom-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.className = 'bottom-notification';
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.className = 'bottom-notification ' + type;
        
        // 显示提示
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 3秒后自动隐藏
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    } else {
        // 使用浮动提示
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }, 100);
    }
}

// 更新书签数组
function updateBookmarkArrays() {
    console.log('开始更新书签数组...');
    
    // 更新左侧书签数组
    const leftContainer = document.getElementById('leftBookmarks');
    console.log('更新左侧书签...');
    leftBookmarks = extractBookmarks(leftContainer);
    console.log('左侧书签数量:', leftBookmarks.length);
    
    // 更新右侧书签数组
    const rightContainer = document.getElementById('rightBookmarks');
    console.log('更新右侧书签...');
    rightBookmarks = extractBookmarks(rightContainer);
    console.log('右侧书签数量:', rightBookmarks.length);
    
    // 如果在差异模式下，更新差异并自动标记
    if (diffMode && leftBookmarks.length > 0 && rightBookmarks.length > 0) {
        console.log('差异模式已开启，重新计算差异...');
        const oldDifferences = differences ? differences.length : 0;
        differences = compareTrees(); // 确保重新赋值差异数组
        
        // 自动标记差异
        console.log('自动标记差异...');
        markDifferences(false);
        
        // 如果差异数量发生变化，显示提示
        if (differences && differences.length !== oldDifferences) {
            showToast(`发现 ${differences.length} 处差异`, 'success', true);
        }
    } else if (diffMode) {
        console.log('差异模式已开启，但书签数据不完整，跳过差异计算');
    }
    
    // 保存状态到本地存储
    saveState();
    
    console.log('书签数组更新完成');
}

// 从DOM中提取书签数据
function extractBookmarks(container) {
    console.log('开始从DOM提取书签数据...');
    const bookmarks = [];
    
    function traverse(element, level = 0) {
        if (!element) {
            console.warn(`遍历层级 ${level} 的元素不存在`);
            return [];
        }
        
        console.log(`遍历层级 ${level} 的元素:`, element.tagName || 'unknown');
        const items = [];
        
        // 如果是根容器，查找 bookmark-tree
        const bookmarkTree = element.querySelector('.bookmark-tree');
        const targetElement = bookmarkTree || element;
        
        if (!targetElement) {
            console.warn('目标元素不存在');
            return items;
        }
        
        const bookmarkItems = Array.from(targetElement.children || []);
        console.log(`发现 ${bookmarkItems.length} 个子元素`);
        
        for (const item of bookmarkItems) {
            if (!item || !item.classList) continue;
            
            if (item.classList.contains('bookmark-item')) {
                const folder = item.querySelector('.folder');
                if (folder) {
                    // 这是一个文件夹
                    const titleElement = folder.querySelector('.folder-title');
                    const title = titleElement ? titleElement.textContent.replace(/\(\d+\)$/, '').trim() : '';
                    console.log(`处理文件夹: ${title}`);
                    const folderChildren = item.querySelector('.folder-children');
                    const children = folderChildren ? traverse(folderChildren, level + 1) : [];
                    items.push({ title, children });
                    console.log(`文件夹 ${title} 包含 ${children.length} 个子项`);
                } else {
                    // 这是一个书签
                    const bookmarkDiv = item.querySelector('.bookmark');
                    if (bookmarkDiv) {
                        const titleElement = bookmarkDiv.querySelector('.bookmark-title');
                        const title = titleElement ? titleElement.textContent : '';
                        const url = titleElement ? titleElement.dataset.url : '';
                        const icon = bookmarkDiv.querySelector('img')?.src || '';
                        
                        console.log(`处理书签: ${title}`);
                        if (title && url) {
                            items.push({
                                title,
                                url,
                                icon
                            });
                        }
                    }
                }
            }
        }
        
        return items;
    }
    
    const result = traverse(container);
    console.log('书签数据提取完成，总数:', result.length);
    return result;
}

// 添加拖拽相关函数
function setupDragAndDrop() {
    console.log('初始化拖拽功能...');
    const containers = document.querySelectorAll('.tree-container');
    console.log(`找到 ${containers.length} 个可拖拽容器`);

    containers.forEach((container, index) => {
        console.log(`设置容器 ${index + 1} 的拖拽事件`);
        
        // 移除旧的事件监听器
        container.removeEventListener('dragover', container._dragoverHandler);
        container.removeEventListener('dragleave', container._dragleaveHandler);
        container.removeEventListener('drop', container._dropHandler);
        
        // 创建新的事件处理函数
        container._dragoverHandler = (e) => {
            e.preventDefault();
            const draggable = document.querySelector('.dragging');
            if (!draggable) {
                console.log('未找到正在拖拽的元素');
                return;
            }
            console.log('拖拽元素:', draggable.textContent);

            // 移除之前的放置指示器
            if (currentDropIndicator) {
                console.log('移除旧的放置指示器');
                currentDropIndicator.remove();
            }

            // 创建新的放置指示器
            console.log('创建新的放置指示器');
            currentDropIndicator = document.createElement('div');
            currentDropIndicator.className = 'bookmark-drop-indicator';

            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement) {
                console.log('放置指示器插入到元素之前:', afterElement.textContent);
                afterElement.parentNode.insertBefore(currentDropIndicator, afterElement);
            } else {
                console.log('放置指示器添加到容器末尾');
                const lastChild = container.querySelector('.bookmark-tree');
                if (lastChild) {
                    lastChild.appendChild(currentDropIndicator);
                } else {
                    container.appendChild(currentDropIndicator);
                }
            }
        };

        container._dragleaveHandler = (e) => {
            if (e.target === container) {
                console.log('离开拖拽容器');
                if (currentDropIndicator) {
                    console.log('移除放置指示器');
                    currentDropIndicator.remove();
                    currentDropIndicator = null;
                }
            }
        };

        container._dropHandler = (e) => handleDrop(e, container);
        
        // 添加新的事件监听器
        container.addEventListener('dragover', container._dragoverHandler);
        container.addEventListener('dragleave', container._dragleaveHandler);
        container.addEventListener('drop', container._dropHandler);
    });
    
    console.log('拖拽功能初始化完成');
}

function getDragAfterElement(container, y) {
    console.log('计算放置位置...');
    const bookmarkTree = container.querySelector('.bookmark-tree');
    if (!bookmarkTree) {
        console.log('未找到书签树容器');
        return null;
    }

    const draggableElements = [...bookmarkTree.querySelectorAll('.bookmark-item:not(.dragging)')];
    console.log(`找到 ${draggableElements.length} 个可用的放置位置`);
    
    let closestElement = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    
    // 遍历所有可放置的元素
    draggableElements.forEach(child => {
        const box = child.getBoundingClientRect();
        const childCenter = box.top + box.height / 2;
        const distance = Math.abs(y - childCenter);
        
        // 如果找到更近的元素
        if (distance < closestDistance) {
            closestDistance = distance;
            closestElement = child;
        }
    });
    
    // 如果找到最近的元素
    if (closestElement) {
        const box = closestElement.getBoundingClientRect();
        // 如果鼠标在元素中心点以下,返回下一个元素作为插入点
        if (y > box.top + box.height / 2) {
            console.log('鼠标在元素下半部分,插入到后面');
            return closestElement.nextElementSibling;
        } else {
            console.log('鼠标在元素上半部分,插入到前面');
            return closestElement;
        }
    }

    console.log('计算放置位置完成:', closestElement ? closestElement.textContent : '容器末尾');
    return null;
}

function handleDrop(e, container) {
    console.log('开始处理拖放操作');
    e.preventDefault();
    const draggable = document.querySelector('.dragging');
    if (!draggable) {
        console.log('未找到要放置的元素');
        return;
    }
    console.log('放置元素:', draggable.textContent);

    const afterElement = getDragAfterElement(container, e.clientY);
    const bookmarkTree = container.querySelector('.bookmark-tree');
    
    if (!bookmarkTree) {
        console.log('创建新的书签树容器');
        const newTree = document.createElement('div');
        newTree.className = 'bookmark-tree';
        container.appendChild(newTree);
    }

    if (afterElement) {
        console.log('将元素插入到:', afterElement.textContent, '之前');
        afterElement.parentNode.insertBefore(draggable.closest('.bookmark-item'), afterElement);
    } else {
        console.log('将元素添加到书签树末尾');
        bookmarkTree.appendChild(draggable.closest('.bookmark-item'));
    }

    // 移除所有放置指示器
    if (currentDropIndicator) {
        console.log('清理放置指示器');
        currentDropIndicator.remove();
        currentDropIndicator = null;
    }

    // 重新绑定拖拽事件
    setupDragAndDrop();
    
    console.log('更新书签数组');
    updateBookmarkArrays();
    console.log('拖放操作完成');
}

// 辅助函数：标记特定书签
function markBookmark(container, title, type, path) {
    if (!container || !title) return;
    
    // 处理根目录的情况
    if (path === '根目录') {
        const rootItems = container.querySelectorAll('.bookmark-item[data-level="0"]');
        rootItems.forEach(item => {
            const bookmarkTitle = item.querySelector('.bookmark-title');
            if (bookmarkTitle && bookmarkTitle.textContent === title) {
                item.classList.add(`diff-${type}`);
                // 标记所有父文件夹
                let parent = item.parentElement;
                while (parent) {
                    const parentItem = parent.closest('.bookmark-item');
                    if (parentItem) {
                        parentItem.classList.add(`diff-${type}`);
                    }
                    parent = parent.parentElement;
                }
            }
        });
        return;
    }
    
    // 处理普通书签
    const bookmarkItems = container.querySelectorAll('.bookmark-item');
    bookmarkItems.forEach(item => {
        const bookmarkTitle = item.querySelector('.bookmark-title');
        if (bookmarkTitle && bookmarkTitle.textContent === title) {
            item.classList.add(`diff-${type}`);
            
            // 标记所有父文件夹
            let parent = item.parentElement;
            while (parent) {
                const parentItem = parent.closest('.bookmark-item');
                if (parentItem) {
                    parentItem.classList.add(`diff-${type}`);
                }
                parent = parent.parentElement;
            }
        }
    });
} 