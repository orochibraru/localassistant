package dev.localassistant.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch

/** Wraps a scrolling screen so pulling it down reads the house again, with the spinner until it's done. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Refreshable(model: HouseModel, content: @Composable () -> Unit) {
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = {
            refreshing = true
            scope.launch {
                model.refresh()
                refreshing = false
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        content()
    }
}
